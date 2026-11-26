import type { Flow, Lesson, NodeId, NodeState, SolveResult } from '../types';

// The Orbi stays visible (yellow cable on Gi1/0/2) so the whole core setup is on screen.
const hidden: Partial<Record<NodeId, NodeState>> = {
  laptop: 'hidden',
  'tent-hub': 'hidden',
  'tent-sensor': 'hidden',
  'tent-fan': 'hidden',
  'tent-light': 'hidden',
};

const OFFLINE_REASON = 'Modem offline: no DOCSIS sync on the coax';

export const corePath: Lesson = {
  id: 'core-path',
  title: 'The core path',
  intro:
    'Every request from the PC takes the same short trip: grey cable to the Cisco switch, up port 1 to the OPNsense firewall (a VM on the Proxmox mini PC), out the USB NIC to the ARRIS modem, and onto the coax to the internet.\n\n' +
    'Press an action to send a packet, then click any device to see what it does and how it is configured. Flip the modem offline to see where things stop, and what still works.',
  params: [
    {
      id: 'modemOnline',
      type: 'toggle',
      label: 'Modem online',
      help: 'Turn this off to simulate the ISP signal dropping (modem lights blinking, no sync).',
      default: true,
      onLabel: 'Online',
      offLabel: 'Offline',
    },
  ],
  actions: [
    { id: 'web', label: 'Load a website from the PC', description: 'An HTTPS request leaves the house.' },
    { id: 'reply', label: 'Reply comes back', description: 'The web server answers.' },
    { id: 'dns', label: 'DNS lookup', description: 'The PC asks for the IP of a name.' },
    { id: 'ping-gw', label: 'Ping the gateway', description: 'PC pings OPNsense at 192.168.1.1.' },
  ],
  solve({ params, action }): SolveResult {
    const online = params.modemOnline !== false;
    const nodes: Partial<Record<NodeId, NodeState>> = { ...hidden };
    if (!online) nodes.modem = 'warn';
    const links: SolveResult['links'] = online ? {} : { coax: 'down' };
    const linkLabels: SolveResult['linkLabels'] = {
      grey: 'Gi1/0/4',
      yellow: 'Gi1/0/2',
      lan: 'Gi1/0/1',
      wan: online ? 'WAN 203.0.113.45' : 'WAN (no lease)',
    };
    const base = { links, nodes, linkLabels };

    const toNet: NodeId[] = ['pc', 'switch', 'opnsense', 'modem', 'internet'];
    const toModem: NodeId[] = ['pc', 'switch', 'opnsense', 'modem'];

    switch (action) {
      case 'web': {
        if (online) {
          return {
            ...base,
            flows: [{ path: toNet, verdict: 'nat', natAt: ['opnsense'], label: 'HTTPS' }],
            status:
              'The request leaves the PC as 192.168.1.50, and OPNsense rewrites the source to the public IP 203.0.113.45 before it goes out the modem.',
            details: [
              'PC (192.168.1.50): the destination is not on 192.168.1.0/24, so it sends the frame to its default gateway, 192.168.1.1.',
              'Switch: learns the PC MAC on Gi1/0/4 and forwards the frame out Gi1/0/1 toward the OPNsense MAC. It never looks at IP addresses.',
              'OPNsense: LAN rules allow it, outbound NAT swaps the source 192.168.1.50 for 203.0.113.45 (and picks a source port), and it records the mapping in its state table.',
              'Modem: bridges the Ethernet frame onto the coax as DOCSIS. No routing, no NAT.',
              'Internet: the server only ever sees 203.0.113.45.',
            ],
          };
        }
        return {
          ...base,
          flows: [{ path: toModem, verdict: 'block', label: 'HTTPS', reason: OFFLINE_REASON }],
          status:
            'The PC, switch and firewall all do their part, but the request dies at the modem because it has no signal from the ISP.',
          details: [
            'PC, switch and OPNsense behave exactly as normal. Nothing on the LAN is broken.',
            'OPNsense hands the packet to its WAN, but the modem has no DOCSIS sync, so nothing gets onto the coax.',
            'Tell-tale signs: modem front-panel lights blinking instead of solid, and OPNsense WAN shows no IP or a stale lease.',
            'Fix: check the coax at the wall and the modem, power-cycle the modem, check the ISP outage page from your phone.',
          ],
        };
      }

      case 'reply': {
        if (online) {
          return {
            ...base,
            flows: [
              {
                path: ['internet', 'modem', 'opnsense', 'switch', 'pc'],
                verdict: 'allow',
                label: 'HTTPS reply',
              },
            ],
            status:
              'The reply is addressed to 203.0.113.45; OPNsense finds the matching state entry, rewrites the destination back to 192.168.1.50 and passes it to the PC.',
            details: [
              'Internet: the server replies to the only address it knows, 203.0.113.45.',
              'Modem: bridges it from coax to Ethernet, unchanged.',
              'OPNsense: unsolicited inbound traffic is blocked on WAN by default, but this packet matches the state created by the outgoing request, so it is allowed and un-NATed to 192.168.1.50.',
              'Switch: forwards it out Gi1/0/4, where it learned the PC MAC.',
              'PC: the browser gets its page.',
            ],
          };
        }
        return {
          ...base,
          flows: [{ path: toModem, verdict: 'block', label: 'HTTPS', reason: OFFLINE_REASON }],
          status:
            'There is no reply to bring back: with the modem offline the request never left the house.',
          details: [
            'A reply only exists if the request reached the server.',
            'The request stops at the modem, so OPNsense never sees anything come back and the browser eventually times out.',
            'Turn the modem back online and try again.',
          ],
        };
      }

      case 'dns': {
        const query: Flow = {
          path: ['pc', 'switch', 'opnsense'],
          verdict: 'allow',
          label: 'DNS',
        };
        if (online) {
          return {
            ...base,
            flows: [
              query,
              { path: ['opnsense', 'modem', 'internet'], verdict: 'allow', label: 'DNS (if not cached)' },
            ],
            status:
              'The PC asks OPNsense at 192.168.1.1; Unbound answers from its cache, or looks the name up on the internet first if it has not seen it recently.',
            details: [
              'PC: DHCP told it to use 192.168.1.1 as its DNS server, so the query (UDP 53) goes to OPNsense.',
              'Switch: forwards it out Gi1/0/1 like any other frame.',
              'OPNsense (Unbound): if the name is cached, it answers right away. Otherwise it resolves it itself, sending queries out the WAN from its own public IP.',
              'Because the query stops at the firewall, DNS can keep answering cached names even when the internet is down.',
            ],
          };
        }
        return {
          ...base,
          flows: [
            query,
            { path: ['opnsense', 'modem'], verdict: 'block', label: 'DNS upstream', reason: OFFLINE_REASON },
          ],
          status:
            'The query still reaches Unbound on OPNsense, so cached names resolve, but anything new fails because Unbound cannot reach the internet.',
          details: [
            'PC to OPNsense works: that part of the path does not touch the modem.',
            'Unbound answers anything still in its cache.',
            'For an uncached name it has to ask servers on the internet, and those queries stop at the modem. The PC gets SERVFAIL or a timeout.',
          ],
        };
      }

      case 'ping-gw': {
        return {
          ...base,
          flows: [
            { path: ['pc', 'switch', 'opnsense'], verdict: 'allow', label: 'ping' },
            { path: ['opnsense', 'switch', 'pc'], verdict: 'allow', label: 'pong' },
          ],
          status: online
            ? 'The PC pings 192.168.1.1 and OPNsense answers; the LAN half of the path is healthy.'
            : 'The gateway still answers even with the modem offline, which tells you the LAN is fine and the problem is upstream.',
          details: [
            'Ping the gateway first when "the internet is down": it splits the problem in half.',
            'Gateway answers: PC, cable, switch and firewall are fine. Look at the WAN, the modem, or the ISP.',
            'Gateway does not answer: look at the PC, the grey cable, Gi1/0/4, or the switch uplink.',
            online
              ? 'Next step would be pinging a public IP, then a name, to separate routing from DNS.'
              : 'Here the modem lights and the OPNsense WAN status are the next things to check.',
          ],
        };
      }

      default:
        return {
          ...base,
          flows: [],
          status: online
            ? 'Everything is connected. Press "Load a website from the PC" to follow a packet out to the internet.'
            : 'The modem has lost its signal. Press "Load a website from the PC" to see where the packet stops, then try "Ping the gateway".',
          details: [
            'Internet → coax → ARRIS modem → USB NIC (vmbr1) → OPNsense VM → built-in NIC (vmbr0) → switch Gi1/0/1 → Gi1/0/4 → PC.',
            'Click any device to see what it is and how it is configured.',
          ],
        };
    }
  },
};
