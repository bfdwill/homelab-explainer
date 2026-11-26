import { snippets } from '../content/snippets';
import type { Lesson, NodeId, NodeState, SolveResult } from '../types';

const BLOCK_REASON = 'Rule: block IOT net → LAN net';

export const iotVlan: Lesson = {
  id: 'iot-vlan',
  title: 'IoT VLAN',
  intro:
    'The grow tent hub, sensor, fan and light are convenient, but they run closed firmware that rarely gets updates and talks to a vendor cloud. On a flat network, a compromised hub can reach the PC as easily as the internet.\n\n' +
    'Turn on the IoT VLAN to put the tent on its own network, VLAN 30 (192.168.30.0/24). The switch keeps it separate, and OPNsense decides what may cross.',
  params: [
    {
      id: 'iotVlan',
      type: 'toggle',
      label: 'IoT VLAN 30',
      help: 'Off: the tent hub is on the main LAN. On: it is on VLAN 30, routed and filtered by OPNsense.',
      default: false,
      onLabel: 'On',
      offLabel: 'Off',
    },
  ],
  actions: [
    { id: 'sensor-net', label: 'Tent sensor → internet', description: 'The hub uploads a sensor reading to the vendor cloud.' },
    { id: 'sensor-pc', label: 'Tent sensor → PC', description: 'Something on the tent hub tries to connect to the PC.' },
    { id: 'pc-hub', label: 'PC → tent hub', description: 'You open the hub local web page from the PC.' },
    { id: 'hub-dns', label: 'Tent hub DNS lookup', description: 'The hub looks up its cloud server name.' },
  ],
  solve({ params, action }): SolveResult {
    const on = params.iotVlan === true;
    const nodes: Partial<Record<NodeId, NodeState>> = {
      orbi: 'hidden',
      laptop: 'hidden',
    };
    if (!on) nodes['tent-hub'] = 'warn';
    const linkLabels: SolveResult['linkLabels'] = on
      ? { lan: 'trunk: VLAN 1 + 30', tent: 'access VLAN 30', grey: 'access VLAN 1' }
      : { lan: 'Gi1/0/1 access VLAN 1', tent: 'Gi1/0/10 VLAN 1', grey: 'access VLAN 1' };
    const base = { links: {}, nodes, linkLabels };

    const hubAddr = on ? '192.168.30.20' : 'a 192.168.1.x address';
    const onNotes = [
      'Switch: Gi1/0/10 is an access port in VLAN 30, so the switch puts the hub\'s untagged frames in VLAN 30; they only get an 802.1Q tag when they leave on the Gi1/0/1 trunk.',
      'Gi1/0/1 is now an 802.1Q trunk: VLAN 1 untagged (native) for the LAN, VLAN 30 tagged for IoT.',
      'Proxmox vmbr0 passes the tagged frames to the VM; OPNsense sees VLAN 30 as its own interface, vtnet0.30 (IOT, 192.168.30.1/24).',
      'IOT rules, top to bottom: allow DNS to the IOT address, block IOT net → LAN net, block IOT net → This Firewall, allow IOT net → any (internet).',
      'LAN keeps its default "allow LAN to any" rule, so LAN → IOT is allowed. State tracking lets the replies back in, but the IoT side can never start a connection to the LAN.',
    ];
    const offNotes = [
      'Gi1/0/10 is in VLAN 1 with the PC, so the hub is just another 192.168.1.x device.',
      'Traffic between devices on the same VLAN is switched directly; it never touches OPNsense, so no firewall rule can stop it.',
      'Turn on the IoT VLAN to force that traffic through the firewall.',
    ];
    const notes = on ? onNotes : offNotes;

    switch (action) {
      case 'sensor-net':
        return {
          ...base,
          flows: [
            {
              path: ['tent-sensor', 'tent-hub', 'switch', 'opnsense', 'modem', 'internet'],
              verdict: 'nat',
              natAt: ['opnsense'],
              label: 'telemetry',
            },
          ],
          status: on
            ? 'Allowed: the hub (192.168.30.20) reaches its cloud through its VLAN 30 gateway 192.168.30.1, and OPNsense NATs it to 203.0.113.45 like any LAN device.'
            : 'Allowed: the hub sends the reading from its 192.168.1.x address through OPNsense to the cloud. The internet part works the same with or without the VLAN.',
          details: [
            `Sensor → hub: the reading travels over the tent link; the hub (${hubAddr}) is the device with an IP.`,
            on
              ? 'Hub → switch Gi1/0/10 (VLAN 30) → trunk Gi1/0/1, tagged 30 → OPNsense vtnet0.30.'
              : 'Hub → switch Gi1/0/10 → Gi1/0/1 → OPNsense LAN (vtnet0).',
            on
              ? 'Rule match: "allow IOT net → any" (the destination is not the LAN, so the block rule above it does not apply). Outbound NAT covers 192.168.30.0/24 too.'
              : 'Rule match: the default "allow LAN to any". Outbound NAT rewrites to 203.0.113.45.',
            ...notes,
          ],
        };

      case 'sensor-pc':
        if (!on) {
          return {
            ...base,
            nodes: { ...nodes, pc: 'warn' },
            flows: [{ path: ['tent-sensor', 'tent-hub', 'switch', 'pc'], verdict: 'allow', label: 'scan' }],
            status:
              'Warning: the hub and the PC share one flat LAN, so the switch delivers this straight to the PC. A compromised IoT device could probe or attack it and OPNsense would never see it.',
            details: [
              'Hub (192.168.1.x) and PC (192.168.1.50) are on the same subnet, so the hub just ARPs for the PC and sends directly.',
              'The switch forwards from Gi1/0/10 to Gi1/0/4. No router, no firewall rule in the path.',
              ...offNotes,
            ],
          };
        }
        return {
          ...base,
          flows: [
            {
              path: ['tent-sensor', 'tent-hub', 'switch', 'opnsense'],
              verdict: 'block',
              label: 'scan',
              reason: BLOCK_REASON,
            },
          ],
          status:
            'Blocked: the PC is on a different subnet now, so the packet has to go through OPNsense, and the IOT rule "block IOT net → LAN net" drops it.',
          details: [
            'The hub (192.168.30.20) sees 192.168.1.50 is not on its subnet and sends to its gateway, 192.168.30.1.',
            'The switch cannot shortcut it to Gi1/0/4: that port is VLAN 1 and the hub is VLAN 30. The only way out is up the trunk on Gi1/0/1, tagged 30.',
            'OPNsense receives it on vtnet0.30 (IOT), evaluates the IOT rules, and the block rule matches before the allow-internet rule.',
            ...onNotes,
          ],
        };

      case 'pc-hub':
        if (!on) {
          return {
            ...base,
            flows: [
              { path: ['pc', 'switch', 'tent-hub'], verdict: 'allow', label: 'HTTP' },
              { path: ['tent-hub', 'switch', 'pc'], verdict: 'allow', label: 'reply' },
            ],
            status:
              'Works, switched directly: the PC and the hub are on the same LAN, so the request goes Gi1/0/4 → Gi1/0/10 without touching OPNsense.',
            details: [
              'Convenient, but it is the same open path the hub could use to reach the PC.',
              ...offNotes,
            ],
          };
        }
        return {
          ...base,
          flows: [
            { path: ['pc', 'switch', 'opnsense', 'switch', 'tent-hub'], verdict: 'allow', label: 'HTTP' },
            { path: ['tent-hub', 'switch', 'opnsense', 'switch', 'pc'], verdict: 'allow', label: 'reply (state)' },
          ],
          status:
            'Allowed: LAN → IOT is permitted, so the PC can open the hub page at 192.168.30.20; the reply is let back in only because it belongs to that connection.',
          details: [
            'PC → gateway 192.168.1.1 (untagged on the trunk) → OPNsense routes it to vtnet0.30 → back down the trunk tagged 30 → Gi1/0/10 → hub.',
            'The packet crosses the switch twice, once in each VLAN. That is normal for "router on a stick".',
            'OPNsense creates a state entry when the PC opens the connection. The hub reply matches it, so it passes even though IOT → LAN is blocked.',
            'To restrict LAN → IOT too, replace the blanket allow with a LAN rule that only allows the hub\'s web UI port to 192.168.30.20.',
            ...onNotes,
          ],
        };

      case 'hub-dns':
        return {
          ...base,
          flows: [
            { path: ['tent-hub', 'switch', 'opnsense'], verdict: 'allow', label: 'DNS' },
            { path: ['opnsense', 'switch', 'tent-hub'], verdict: 'allow', label: 'answer' },
          ],
          status: on
            ? 'Allowed: the hub asks Unbound at its gateway 192.168.30.1, which the first IOT rule explicitly allows (DNS to this firewall).'
            : 'Allowed: the hub asks Unbound at 192.168.1.1 like every other LAN device.',
          details: [
            on
              ? 'The DNS allow sits above "block IOT net → This Firewall"; without it, that rule would drop DNS to 192.168.30.1 along with the GUI and SSH.'
              : 'DHCP on the LAN gives the hub 192.168.1.1 as its DNS server.',
            on
              ? 'Unbound must listen on the IOT interface (or all interfaces) for this to work.'
              : 'Nothing stops the hub from using any other DNS server either.',
            ...notes,
          ],
        };

      default:
        return {
          ...base,
          flows: [],
          status: on
            ? 'The tent hub is on IoT VLAN 30 (192.168.30.20): it can reach the internet, but not the LAN. Try "Tent sensor → PC".'
            : 'The tent hub is on the flat main LAN, right next to the PC. Try "Tent sensor → PC" to see why that is a problem.',
          details: notes,
        };
    }
  },
  deviceNotes: {
    opnsense: {
      body: 'VLAN 30 lives on the LAN NIC as vtnet0.30, assigned as the IOT interface (192.168.30.1/24) with its own DHCP range. Rule order on IOT matters: allow DNS, block to LAN net, block to This Firewall, then allow any.',
      snippets: [snippets.opnsenseVlan30, snippets.opnsenseIotRules],
    },
    switch: {
      body: 'Create VLAN 30, make Gi1/0/10 an access port in it, and turn Gi1/0/1 into a trunk carrying VLAN 1 (native, untagged) and VLAN 30 (tagged) up to OPNsense.',
      snippets: [snippets.iosVlan30, snippets.iosPort1Trunk, snippets.iosTentAccessPort],
    },
    proxmox: {
      body: 'The LAN bridge vmbr0 has to pass VLAN 30 tagged frames through to the OPNsense VM. Make vmbr0 VLAN-aware and leave the VM network device without a VLAN tag: the VM then receives untagged VLAN 1 plus tagged VLAN 30, and OPNsense handles the tags itself on vtnet0.30.',
    },
    'tent-hub': {
      body: 'On VLAN 30 the hub gets 192.168.30.20 (a DHCP reservation on the IOT interface), with gateway and DNS 192.168.30.1. It can reach the internet and the firewall DNS, but not 192.168.1.0/24.',
    },
  },
};
