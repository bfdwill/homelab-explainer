import { snippets } from '../content/snippets';
import type { Lesson, NodeId, NodeState, SolveResult } from '../types';

type Cause = 'cable' | 'port-shutdown' | 'err-disabled' | 'wrong-vlan';

const hidden: Partial<Record<NodeId, NodeState>> = {
  'tent-hub': 'hidden',
  'tent-sensor': 'hidden',
  'tent-fan': 'hidden',
  'tent-light': 'hidden',
};

interface CauseInfo {
  /** Whether the yellow cable shows physical link with this fault. */
  linkUp: boolean;
  /** Where a laptop packet stops. */
  laptopStop: NodeId[];
  laptopReason: string;
  pcReason: string;
  status: string;
  showStatus: string;
  fixedBy: string;
  checklist: string[];
}

const commonChecks = [
  'Look at the link LEDs on both ends: Gi1/0/2 on the switch and the port on the Orbi. No light on either end means no physical link.',
  'On the switch: `show interfaces status` and find Gi1/0/2 (connected / notconnect / disabled / err-disabled).',
  'Leave speed and duplex on auto on both ends. A hard-coded mismatch can keep the link down or make it flap.',
  'PoE is not the issue here: the Orbi has its own power adapter, so check that it is actually powered on (front/top LED lit).',
];

const causes: Record<Cause, CauseInfo> = {
  cable: {
    linkUp: false,
    laptopStop: ['laptop', 'orbi'],
    laptopReason: 'No link on Gi1/0/2 (yellow cable)',
    pcReason: 'Gi1/0/2 is notconnect: no link to the Orbi',
    status:
      'Gi1/0/2 shows notconnect and both LEDs are dark: the yellow cable (or a port at either end) is not passing a signal, so WiFi clients have nowhere to go.',
    showStatus: 'Gi1/0/2  Orbi (yellow)  notconnect  1  auto  auto  10/100/1000BaseTX',
    fixedBy: 'reseating the yellow cable',
    checklist: [
      'Reseat the yellow cable at both ends until it clicks.',
      'Swap the yellow cable for a known-good one (the grey PC cable is a quick test).',
      'Try another switch port, e.g. Gi1/0/3, with the same config. If that works, Gi1/0/2 itself may be bad.',
      '`show interfaces gi1/0/2` and check for input errors or CRC counters climbing, a sign of a damaged cable.',
    ],
  },
  'port-shutdown': {
    linkUp: false,
    laptopStop: ['laptop', 'orbi'],
    laptopReason: 'Gi1/0/2 is administratively down (shutdown)',
    pcReason: 'Gi1/0/2 is disabled (shutdown in config)',
    status:
      'Gi1/0/2 shows disabled: the cable is fine, but the port has `shutdown` in its config, so the switch will not bring the link up.',
    showStatus: 'Gi1/0/2  Orbi (yellow)  disabled  1  auto  auto  10/100/1000BaseTX',
    fixedBy: 'running `no shutdown` on Gi1/0/2',
    checklist: [
      '`show running-config interface gi1/0/2` and look for a `shutdown` line.',
      'Fix: `conf t`, `interface gi1/0/2`, `no shutdown`, `end`, then `write memory`.',
      'The port LED should go green within a few seconds; spanning tree may hold it in a blocking/learning state for up to ~30 s unless `spanning-tree portfast` is set.',
    ],
  },
  'err-disabled': {
    linkUp: false,
    laptopStop: ['laptop', 'orbi'],
    laptopReason: 'Gi1/0/2 is err-disabled by the switch',
    pcReason: 'Gi1/0/2 is err-disabled',
    status:
      'Gi1/0/2 shows err-disabled: the switch shut the port itself after a violation (for example BPDU guard or port security), and it stays down until you clear it.',
    showStatus: 'Gi1/0/2  Orbi (yellow)  err-disabled  1  auto  auto  10/100/1000BaseTX',
    fixedBy: 'clearing the err-disable and fixing its cause',
    checklist: [
      '`show interfaces status err-disabled` (Reason column: bpduguard, psecure-violation, link-flap...) and `show logging | include ERR-DISABLE`; `show errdisable recovery` shows whether auto-recovery is on.',
      'Fix the cause first (for example remove a loop, or adjust port security), otherwise it will trip again.',
      'Bounce the port: `interface gi1/0/2`, `shutdown`, then `no shutdown`.',
      'Optionally enable automatic recovery: `errdisable recovery cause <cause>`.',
    ],
  },
  'wrong-vlan': {
    linkUp: true,
    laptopStop: ['laptop', 'orbi', 'switch'],
    laptopReason: 'Gi1/0/2 is in VLAN 30, but Gi1/0/1 only carries VLAN 1',
    pcReason: 'Gi1/0/2 is in VLAN 30 and the PC is in VLAN 1',
    status:
      'The link is up, but Gi1/0/2 is in the wrong VLAN (30 instead of 1). In AP mode the Orbi bridges WiFi clients straight onto that VLAN, so their DHCP requests never reach OPNsense and they end up with no usable address.',
    showStatus: 'Gi1/0/2  Orbi (yellow)  connected  30  a-full  a-1000  10/100/1000BaseTX',
    fixedBy: 'putting Gi1/0/2 back in VLAN 1',
    checklist: [
      'In `show interfaces status`, the Vlan column for Gi1/0/2 says 30, not 1. `show vlan brief` lists the ports in each VLAN.',
      'Fix: `conf t`, `interface gi1/0/2`, `switchport access vlan 1`, `end`, then `write memory`.',
      'On the laptop, a 169.254.x.x address (Windows "No internet", macOS "Self-assigned IP") means its DHCP request got no answer.',
    ],
  },
};

export const orbiDown: Lesson = {
  id: 'orbi-down',
  title: 'Orbi down',
  intro:
    'Right now the yellow cable from switch port Gi1/0/2 to the Orbi has no link, so every WiFi device has a signal but no internet. The Orbi runs in AP mode, so it does not hand out addresses either: DHCP comes from OPNsense, on the far side of that cable.\n\n' +
    'Pick a likely cause to see its symptoms and fix, then flip the link up to watch WiFi traffic flow again.',
  params: [
    {
      id: 'orbiLinkUp',
      type: 'toggle',
      label: 'Orbi link (Gi1/0/2)',
      help: 'Off matches reality today: the yellow cable shows no link.',
      default: false,
      onLabel: 'Up',
      offLabel: 'Down',
    },
    {
      id: 'cause',
      type: 'choice',
      label: 'Suspected cause',
      help: 'What is actually wrong while the link is down.',
      default: 'cable',
      options: [
        { value: 'cable', label: 'Bad or loose cable' },
        { value: 'port-shutdown', label: 'Port shut down in config' },
        { value: 'err-disabled', label: 'Port err-disabled' },
        { value: 'wrong-vlan', label: 'Port in the wrong VLAN' },
      ],
    },
  ],
  actions: [
    { id: 'laptop-web', label: 'Laptop loads a website', description: 'A WiFi client tries to reach the internet.' },
    { id: 'pc-to-orbi', label: 'PC reaches the Orbi', description: 'The PC looks for the Orbi at 192.168.1.2, out Gi1/0/2.' },
    { id: 'laptop-dhcp', label: 'Laptop asks for an IP', description: 'In AP mode the laptop gets its address from OPNsense, not the Orbi.' },
  ],
  solve({ params, action }): SolveResult {
    const up = params.orbiLinkUp === true;
    const causeId = (typeof params.cause === 'string' && params.cause in causes ? params.cause : 'cable') as Cause;
    const cause = causes[causeId];

    const nodes: Partial<Record<NodeId, NodeState>> = { ...hidden };
    const links: SolveResult['links'] = {};
    const linkLabels: SolveResult['linkLabels'] = { yellow: 'Gi1/0/2' };

    if (!up) {
      nodes.orbi = 'warn';
      if (!cause.linkUp) links.yellow = 'down';
      else linkLabels.yellow = 'Gi1/0/2 · VLAN 30 (wrong)';
    }

    const base = { links, nodes, linkLabels };
    const upDetails = [
      `Fixed by ${cause.fixedBy}. \`show interfaces status\` now shows: Gi1/0/2  Orbi (yellow)  connected  1  a-full  a-1000`,
      'Laptop (192.168.1.x lease from OPNsense) → Orbi over WiFi → bridged onto the yellow cable → Gi1/0/2 → Gi1/0/1 → OPNsense → modem → internet.',
      'The Orbi is in AP mode, so it is only a bridge: OPNsense is the laptop\'s gateway (192.168.1.1), its DHCP server and the only NAT. The "Double NAT" lesson shows what router mode would add.',
    ];
    const downDetails = [`Switch says: ${cause.showStatus}`, ...cause.checklist, ...commonChecks];

    switch (action) {
      case 'laptop-web': {
        if (up) {
          return {
            ...base,
            flows: [
              {
                path: ['laptop', 'orbi', 'switch', 'opnsense', 'modem', 'internet'],
                verdict: 'nat',
                natAt: ['opnsense'],
                label: 'HTTPS',
              },
            ],
            status:
              'The link is up: the laptop request crosses the yellow cable to the switch and out through OPNsense to the internet.',
            details: upDetails,
          };
        }
        return {
          ...base,
          flows: [{ path: cause.laptopStop, verdict: 'block', label: 'HTTPS', reason: cause.laptopReason }],
          status: cause.status,
          details: downDetails,
        };
      }

      case 'pc-to-orbi': {
        if (up) {
          return {
            ...base,
            flows: [{ path: ['pc', 'switch', 'orbi'], verdict: 'allow', label: 'ARP 192.168.1.2' }],
            status: 'Frames from the wired side now leave Gi1/0/2 and the Orbi answers at its AP address, 192.168.1.2, on the same LAN as the PC.',
            details: upDetails,
          };
        }
        return {
          ...base,
          flows: [{ path: ['pc', 'switch'], verdict: 'block', label: 'ARP 192.168.1.2', reason: cause.pcReason }],
          status: cause.linkUp
            ? `The link is up, but the switch keeps VLANs apart: ${cause.pcReason}, so the PC's ARP never reaches the Orbi.`
            : `The switch has nowhere to send it: ${cause.pcReason}.`,
          details: downDetails,
        };
      }

      case 'laptop-dhcp': {
        if (up) {
          return {
            ...base,
            flows: [
              { path: ['laptop', 'orbi', 'switch', 'opnsense'], verdict: 'allow', label: 'DHCP Discover' },
              { path: ['opnsense', 'switch', 'orbi', 'laptop'], verdict: 'allow', label: 'DHCP Offer' },
            ],
            status:
              'The Orbi bridges the laptop\'s DHCP request across the yellow cable to OPNsense, which offers a 192.168.1.x lease with gateway and DNS 192.168.1.1.',
            details: upDetails,
          };
        }
        return {
          ...base,
          flows: [
            {
              path: cause.laptopStop,
              verdict: 'block',
              label: 'DHCP Discover',
              reason: 'No DHCP server: in AP mode that is OPNsense',
            },
          ],
          status:
            'WiFi itself still works and the laptop joins the network, but the Orbi in AP mode does not hand out addresses. The DHCP request cannot reach OPNsense, so a newly joining laptop falls back to a 169.254.x.x address.',
          details: downDetails,
        };
      }

      default:
        return {
          ...base,
          flows: [],
          status: up
            ? `The yellow link is up again (fixed by ${cause.fixedBy}). Press "Laptop loads a website" to watch WiFi traffic reach the internet.`
            : `${cause.status} Press "Laptop loads a website" to see where it stops.`,
          details: up ? upDetails : downDetails,
        };
    }
  },
  deviceNotes: {
    switch: {
      body: 'Start every link problem on the switch: it tells you whether the port sees a link, whether it is shut down, err-disabled, or counting errors.',
      snippets: [snippets.iosLinkTroubleshoot],
    },
    orbi: {
      body: 'In AP mode the Orbi is only a bridge: its own address (192.168.1.2) and every WiFi client\'s address come from OPNsense across the yellow cable, so when that link drops, new WiFi clients cannot get an address at all. The Orbi has its own power supply; PoE from the switch does not power it.',
    },
  },
};
