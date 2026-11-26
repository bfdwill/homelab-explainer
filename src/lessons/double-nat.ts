import { snippets } from '../content/snippets';
import type { Lesson, NodeId, NodeState, SolveResult } from '../types';

const hidden: Partial<Record<NodeId, NodeState>> = {
  'tent-hub': 'hidden',
  'tent-sensor': 'hidden',
  'tent-fan': 'hidden',
  'tent-light': 'hidden',
};

const toNet: NodeId[] = ['laptop', 'orbi', 'switch', 'opnsense', 'modem', 'internet'];

export const doubleNat: Lesson = {
  id: 'double-nat',
  title: 'Double NAT',
  intro:
    'My Orbi runs in AP mode: it only bridges WiFi onto the LAN, and OPNsense is the one router. Out of the box, though, an Orbi is a router. Left that way behind OPNsense, it runs its own little network (10.0.0.0/24), which means two routers, two firewalls and two layers of NAT between a WiFi device and the internet.\n\n' +
    'This lesson assumes the yellow cable is fixed. It starts in AP mode, the real setup. Send some packets, then flip the Orbi to router mode to see what double NAT would break.',
  params: [
    {
      id: 'orbiMode',
      type: 'choice',
      label: 'Orbi mode',
      help: 'AP mode (the real setup): Orbi only bridges WiFi onto the LAN. Router mode (factory default): Orbi does its own DHCP and NAT.',
      default: 'ap',
      options: [
        { value: 'ap', label: 'AP mode (my setup)' },
        { value: 'router', label: 'Router mode (what-if)' },
      ],
    },
  ],
  actions: [
    { id: 'laptop-web', label: 'Laptop loads a website', description: 'Count the NAT badges.' },
    { id: 'laptop-to-pc', label: 'Laptop reaches the PC', description: 'Laptop opens a share or stream on 192.168.1.50.' },
    { id: 'pc-to-laptop', label: 'PC reaches the laptop', description: 'PC tries to cast to, or discover, the laptop.' },
    { id: 'port-forward', label: 'Inbound game connection', description: 'A friend connects to a game hosted on the laptop.' },
  ],
  solve({ params, action }): SolveResult {
    const ap = params.orbiMode === 'ap';
    const nodes: Partial<Record<NodeId, NodeState>> = { ...hidden };
    if (!ap) nodes.orbi = 'highlight';
    const linkLabels: SolveResult['linkLabels'] = ap
      ? {
          wifi: '192.168.1.0/24 (bridged)',
          yellow: 'Gi1/0/2 · AP 192.168.1.2',
          grey: '192.168.1.0/24',
          wan: 'public 203.0.113.45',
        }
      : {
          wifi: '10.0.0.0/24 (Orbi LAN)',
          yellow: 'Gi1/0/2 · Orbi WAN 192.168.1.2',
          grey: '192.168.1.0/24',
          wan: 'public 203.0.113.45',
        };
    const base = { links: {}, nodes, linkLabels };

    const routerProblems = [
      'Port forwards: an inbound connection needs a forward on OPNsense to 192.168.1.2 AND a second one on the Orbi to the laptop.',
      'UPnP / NAT-PMP: a game or console can usually only open a port on the Orbi, not on OPNsense, so it still reports "strict" or "moderate" NAT.',
      'Gaming and VoIP: peer-to-peer and SIP traffic that relies on predictable NAT behaviour breaks more often with two layers.',
      'Discovery: casting, AirPlay, printer and file share discovery use broadcast/multicast, which does not cross the Orbi router, so the two sides cannot see each other.',
      'Visibility: OPNsense sees every WiFi device as one host, 192.168.1.2, so its logs and per-device rules are useless for WiFi clients.',
    ];
    const apNotes = [
      'In AP mode the Orbi stops doing DHCP, NAT and firewalling. It bridges WiFi frames straight onto the wired LAN.',
      'The laptop gets 192.168.1.x from OPNsense DHCP and uses 192.168.1.1 as its gateway and DNS.',
      'One NAT (at OPNsense), one firewall, one place for port forwards, and WiFi and wired devices share a broadcast domain, so discovery and casting work.',
    ];

    switch (action) {
      case 'laptop-web':
        if (!ap) {
          return {
            ...base,
            flows: [{ path: toNet, verdict: 'nat', natAt: ['orbi', 'opnsense'], label: 'HTTPS' }],
            status:
              'Double NAT: the Orbi rewrites the laptop 10.0.0.x to 192.168.1.2, then OPNsense rewrites 192.168.1.2 to the public 203.0.113.45.',
            details: [
              'Laptop (10.0.0.23, for example): sends to its gateway, the Orbi at 10.0.0.1.',
              'Orbi NAT #1: source 10.0.0.23 becomes 192.168.1.2, its WAN address on the main LAN.',
              'Switch: just forwards the frame from Gi1/0/2 to Gi1/0/1.',
              'OPNsense NAT #2: source 192.168.1.2 becomes 203.0.113.45.',
              'Browsing still works fine; the problems show up with anything inbound or peer-to-peer:',
              ...routerProblems,
            ],
          };
        }
        return {
          ...base,
          flows: [{ path: toNet, verdict: 'nat', natAt: ['opnsense'], label: 'HTTPS' }],
          status:
            'Single NAT: the laptop is a normal 192.168.1.x LAN device, and only OPNsense rewrites its address to 203.0.113.45.',
          details: [
            'Laptop (192.168.1.60, for example): sends to its gateway, OPNsense at 192.168.1.1.',
            'Orbi (AP): bridges the WiFi frame onto the yellow cable unchanged.',
            'OPNsense: one NAT, 192.168.1.60 becomes 203.0.113.45.',
            ...apNotes,
          ],
        };

      case 'laptop-to-pc':
        if (!ap) {
          return {
            ...base,
            flows: [
              { path: ['laptop', 'orbi', 'switch', 'pc'], verdict: 'nat', natAt: ['orbi'], label: 'SMB' },
              { path: ['pc', 'switch', 'orbi', 'laptop'], verdict: 'allow', label: 'reply' },
            ],
            status:
              'This direction works: the Orbi NATs the laptop to 192.168.1.2, so the PC sees the connection coming from the Orbi and the reply finds its way back through the Orbi state table.',
            details: [
              'The laptop knows the PC address 192.168.1.50 and sends to it through the Orbi, its gateway.',
              'The Orbi treats 192.168.1.0/24 as "the internet" and NATs the source to 192.168.1.2.',
              'The PC is on the same subnet as 192.168.1.2, so it replies directly through the switch; it never sees the laptop real address.',
              'Outbound from inside a NAT always works. It is the other direction that breaks, so try "PC reaches the laptop".',
            ],
          };
        }
        return {
          ...base,
          flows: [
            { path: ['laptop', 'orbi', 'switch', 'pc'], verdict: 'allow', label: 'SMB' },
            { path: ['pc', 'switch', 'orbi', 'laptop'], verdict: 'allow', label: 'reply' },
          ],
          status:
            'Laptop and PC are on the same 192.168.1.0/24 network, so they talk directly through the Orbi and switch with no NAT and no router in between.',
          details: [
            'Same subnet means no gateway: the laptop ARPs for 192.168.1.50 and the PC answers.',
            'OPNsense is not involved at all; the switch and the Orbi bridge carry the frames.',
            ...apNotes,
          ],
        };

      case 'pc-to-laptop':
        if (!ap) {
          return {
            ...base,
            flows: [
              {
                path: ['pc', 'switch', 'orbi'],
                verdict: 'block',
                label: 'cast',
                reason: 'Unsolicited inbound dropped by Orbi NAT',
              },
            ],
            status:
              'Blocked: from the PC side the whole WiFi network is one address, 192.168.1.2, and the Orbi drops new inbound connections it has no state or port forward for.',
            details: [
              'The PC cannot address 10.0.0.x directly: it has no route to it, so it would send that traffic to OPNsense, which has no route to 10.0.0.0/24 and would push it out its WAN default route, where it goes nowhere.',
              'The only reachable address is the Orbi WAN, 192.168.1.2, and nothing on it is waiting for this connection.',
              'Casting and discovery are worse still: their broadcast and multicast packets never leave 192.168.1.0/24, so the PC cannot even see that the laptop exists.',
              'Fixes: put the Orbi in AP mode (best), or add port forwards on the Orbi for each service (fragile).',
            ],
          };
        }
        return {
          ...base,
          flows: [
            { path: ['pc', 'switch', 'orbi', 'laptop'], verdict: 'allow', label: 'cast' },
            { path: ['laptop', 'orbi', 'switch', 'pc'], verdict: 'allow', label: 'reply' },
          ],
          status:
            'Works both ways now: the PC sends straight to the laptop 192.168.1.x address, and discovery broadcasts reach the WiFi side too.',
          details: [
            'With the Orbi bridging, the WiFi clients are in the same broadcast domain as the PC.',
            'mDNS / SSDP discovery, casting and file sharing all just work.',
            ...apNotes,
          ],
        };

      case 'port-forward':
        if (!ap) {
          return {
            ...base,
            flows: [
              {
                path: ['internet', 'modem', 'opnsense', 'switch', 'orbi'],
                verdict: 'block',
                label: 'game',
                reason: 'Unsolicited inbound dropped by Orbi NAT (needs a second port forward)',
              },
            ],
            status:
              'Even with a port forward on OPNsense to 192.168.1.2, the connection dies at the Orbi unless you add a matching forward there too.',
            details: [
              'OPNsense forward: 203.0.113.45:27015 → 192.168.1.2:27015 (the Orbi WAN).',
              'The Orbi then needs its own forward: 192.168.1.2:27015 → 10.0.0.23:27015. Without it, it drops the packet.',
              'UPnP on the laptop would only open the Orbi side, and the laptop address can change with Orbi DHCP.',
              'Every service needs two forwards, kept in sync, on two different admin pages.',
            ],
          };
        }
        return {
          ...base,
          flows: [
            {
              path: ['internet', 'modem', 'opnsense', 'switch', 'orbi', 'laptop'],
              verdict: 'nat',
              natAt: ['opnsense'],
              label: 'game',
            },
          ],
          status:
            'One port forward on OPNsense rewrites the destination from 203.0.113.45 to the laptop LAN address, and the Orbi just bridges it over WiFi.',
          details: [
            'OPNsense forward: 203.0.113.45:27015 → 192.168.1.60:27015 (give the laptop a DHCP reservation so it stays put).',
            'The Orbi, as an AP, has no NAT or firewall to get in the way.',
            ...apNotes,
          ],
        };

      default:
        return {
          ...base,
          flows: [],
          status: ap
            ? 'The Orbi is in AP mode, as it really is: WiFi devices sit on 192.168.1.0/24 with the PC. Press "Laptop loads a website" and count the NAT badges, then try router mode.'
            : 'What-if: with the Orbi in router mode, WiFi devices would live on 10.0.0.0/24 behind a second NAT. Press "Laptop loads a website" and count the NAT badges.',
          details: ap ? apNotes : routerProblems,
        };
    }
  },
  deviceNotes: {
    orbi: {
      body: 'This Orbi runs in AP mode: its cable is on Gi1/0/2, it has 192.168.1.2 (reserved in OPNsense DHCP), and it hands out no addresses of its own. Router mode is the factory default; the steps below are how to switch out of it.',
      snippets: [snippets.orbiApMode],
    },
    opnsense: {
      body: 'In AP mode (the real setup) each WiFi device gets its own LAN lease and shows up separately in OPNsense. In router mode OPNsense would see all WiFi traffic as coming from one address, 192.168.1.2.',
    },
  },
};
