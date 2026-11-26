import type { DeviceInfo, NodeId } from '../types';
import { snippets } from './snippets';

export const devices: Record<NodeId, DeviceInfo> = {
  internet: {
    id: 'internet',
    name: 'The internet',
    what:
      "Everything outside the house: websites, game servers, cloud services, and the ISP's own network that connects you to them.",
    why:
      'The whole point of the lab is to get packets out here and back safely. The ISP hands the house one public IPv4 address, and everything inside shares it.',
    facts: [
      { label: 'Public IP (example)', value: '203.0.113.45 (documentation range, not the real one)' },
      { label: 'Assigned by', value: 'ISP DHCP, to the OPNsense WAN' },
      { label: 'Reached over', value: 'Coax from the wall jack' },
    ],
  },

  modem: {
    id: 'modem',
    name: 'ARRIS cable modem',
    model: 'ARRIS DOCSIS cable modem',
    what:
      "A DOCSIS cable modem. It turns the radio-frequency signal on the coax into plain Ethernet and back. It's a pure modem: no routing, no NAT, no WiFi, no firewall.",
    why:
      'Cable internet arrives as coax, and nothing else in the lab speaks DOCSIS. Because the modem only bridges, the public IP passes straight through to the OPNsense WAN, so OPNsense is the only device doing routing and NAT at the edge.',
    facts: [
      { label: 'Role', value: 'Bridge: coax (DOCSIS) to Ethernet' },
      { label: 'Routing / NAT', value: 'None' },
      { label: 'Ethernet port', value: 'To the USB NIC on the Proxmox host (OPNsense WAN)' },
      { label: 'Tip', value: 'If you swap the device behind it, power-cycle the modem so it learns the new MAC' },
    ],
  },

  proxmox: {
    id: 'proxmox',
    name: 'Proxmox host (mini PC)',
    model: 'Mini PC running Proxmox VE',
    what:
      'A small, low-power PC running Proxmox VE, a hypervisor that runs virtual machines. Its job here is to host the OPNsense firewall as a VM.',
    why:
      'It has two physical network ports, which is exactly what a firewall needs: one facing the modem, one facing the house. Each NIC is attached to a Linux bridge, and OPNsense gets one virtual NIC on each bridge. The host itself has no IP on the WAN bridge, so it is not exposed to the internet.',
    facts: [
      { label: 'Built-in NIC', value: 'vmbr0, LAN side, cabled to switch Gi1/0/1' },
      { label: 'USB NIC', value: 'vmbr1, WAN side, cabled to the ARRIS modem' },
      { label: 'Guest', value: 'OPNsense VM (vtnet0 on vmbr0, vtnet1 on vmbr1)' },
    ],
    snippets: [snippets.proxmoxNetwork],
  },

  opnsense: {
    id: 'opnsense',
    name: 'OPNsense firewall (VM)',
    model: 'OPNsense, virtual machine on Proxmox',
    what:
      "The house's router and firewall. It holds the public IP on its WAN, hands out addresses on the LAN with DHCP, answers DNS with Unbound, and decides which traffic is allowed between networks.",
    why:
      'Every packet leaving or entering the house passes through it, so this is where NAT (many private addresses sharing one public one) and security rules live. Later it also becomes the gateway for the IoT VLAN.',
    facts: [
      { label: 'WAN', value: 'vtnet1 on vmbr1, DHCP from ISP (e.g. 203.0.113.45)' },
      { label: 'LAN', value: 'vtnet0 on vmbr0, 192.168.1.1/24' },
      { label: 'IoT (planned)', value: 'vtnet0.30, 192.168.30.1/24' },
      { label: 'Services', value: 'DHCP, DNS (Unbound), outbound NAT, firewall rules' },
    ],
    snippets: [snippets.opnsenseInterfaces, snippets.opnsenseOutboundNat],
  },

  switch: {
    id: 'switch',
    name: 'Cisco Catalyst 3650',
    model: 'Cisco Catalyst 3650-24PS (WS-C3650-24PS), 24 ports PoE+',
    what:
      "A managed 24-port gigabit switch with PoE+. It moves Ethernet frames between ports by MAC address, and it understands VLANs, so one physical switch can carry several separate networks.",
    why:
      "It is the hub of the wired network. Port 1 goes up to OPNsense, and everything else plugs in below it. Because it's managed, you can see link status, errors and VLANs on every port.",
    facts: [
      { label: 'Management IP', value: '192.168.1.3 (VLAN 1 SVI)' },
      { label: 'Default gateway', value: '192.168.1.1 (OPNsense)' },
      { label: 'Gi1/0/1', value: 'Uplink to OPNsense LAN' },
      { label: 'Gi1/0/2', value: 'Yellow cable to the Orbi' },
      { label: 'Gi1/0/4', value: 'Grey cable to the PC' },
      { label: 'Gi1/0/10', value: 'Tent hub (planned, VLAN 30)' },
    ],
    snippets: [snippets.iosBaseline, snippets.iosPort1Access, snippets.iosPcPort, snippets.iosOrbiPort],
  },

  orbi: {
    id: 'orbi',
    name: 'Netgear Orbi',
    model: 'Netgear Orbi mesh WiFi router',
    what:
      'A mesh WiFi system. It can run as a full router (its own DHCP, NAT and firewall) or as a plain access point that just bridges WiFi clients onto the wired LAN.',
    why:
      "It gives the house WiFi. It hangs off the switch on the yellow cable rather than sitting at the edge, because OPNsense is the real router. Ideally it runs in AP mode so WiFi devices land on the same 192.168.1.x LAN as everything else.",
    facts: [
      { label: 'Switch port', value: 'Gi1/0/2 (yellow cable), plugs into the Orbi WAN/Internet port' },
      { label: 'AP mode', value: '192.168.1.2, WiFi clients get 192.168.1.x from OPNsense' },
      { label: 'Router mode', value: 'WAN 192.168.1.2, own LAN 10.0.0.0/24, gateway 10.0.0.1' },
      { label: 'Power', value: 'Its own power adapter (not PoE)' },
      { label: 'Current state', value: 'Link on Gi1/0/2 is down' },
    ],
    snippets: [snippets.orbiRouterMode, snippets.orbiApMode],
  },

  laptop: {
    id: 'laptop',
    name: 'Laptop (WiFi client)',
    what: 'Any wireless device: a laptop, phone or TV that connects to the Orbi over WiFi.',
    why:
      "It stands in for every WiFi device in the house. Where it gets its address from (the Orbi or OPNsense) depends on the Orbi's mode.",
    facts: [
      { label: 'Orbi in AP mode', value: '192.168.1.x from OPNsense DHCP, gateway 192.168.1.1' },
      { label: 'Orbi in router mode', value: '10.0.0.x from the Orbi, gateway 10.0.0.1' },
      { label: 'Connection', value: 'WiFi to the Orbi' },
    ],
  },

  pc: {
    id: 'pc',
    name: 'Desktop PC',
    what: 'The main wired computer, on the grey cable.',
    why:
      'A wired port gives it full gigabit speed and the lowest latency. It sits directly on the main LAN, the trusted network.',
    facts: [
      { label: 'IP', value: '192.168.1.50' },
      { label: 'Gateway / DNS', value: '192.168.1.1 (OPNsense)' },
      { label: 'Switch port', value: 'Gi1/0/4 (grey cable), access VLAN 1' },
    ],
  },

  'tent-hub': {
    id: 'tent-hub',
    name: 'Grow tent hub',
    model: 'Smart grow tent controller',
    what:
      'The controller for the smart grow tent. It is wired to the switch and talks to the sensor, fan and light, and to its vendor cloud for the phone app.',
    why:
      "IoT gear is the least trustworthy thing on a network: closed firmware, rare updates, and it phones home. That's why the plan puts it on its own IoT VLAN, where it can reach the internet but not the PC.",
    facts: [
      { label: 'Switch port', value: 'Gi1/0/10' },
      { label: 'Planned VLAN', value: 'VLAN 30 (IOT), access port' },
      { label: 'Planned IP', value: '192.168.30.20, gateway 192.168.30.1' },
    ],
  },

  'tent-sensor': {
    id: 'tent-sensor',
    name: 'Tent sensor',
    what: 'Temperature and humidity sensor inside the grow tent.',
    why: 'It reports readings to the tent hub, which uploads them to the cloud and uses them to drive the fan and light.',
    facts: [
      { label: 'Connects to', value: 'Tent hub' },
      { label: 'Traffic', value: 'Telemetry to the vendor cloud via the hub' },
    ],
  },

  'tent-fan': {
    id: 'tent-fan',
    name: 'Tent fan',
    what: 'Inline exhaust fan for the tent.',
    why: 'The hub speeds it up or slows it down based on temperature and humidity.',
    facts: [{ label: 'Connects to', value: 'Tent hub' }],
  },

  'tent-light': {
    id: 'tent-light',
    name: 'Grow light',
    what: 'LED grow light.',
    why: 'The hub runs it on a schedule (for example 18 hours on, 6 off).',
    facts: [{ label: 'Connects to', value: 'Tent hub' }],
  },
};
