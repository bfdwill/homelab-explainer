/**
 * Canonical config snippets for the home lab, keyed by SnippetKey.
 *
 * Conventions:
 * - IPs, ports and interface names match the "Shared facts" table in PLAN.md.
 * - 203.0.113.0/24 is a documentation range (RFC 5737); it is not a real WAN IP.
 * - NIC names (enp1s0, enx...) are examples; yours will differ.
 * - No real secrets: anything in <angle brackets> is a placeholder.
 * - OPNsense is configured in its web GUI, so OPNsense snippets are written as
 *   "menu path + settings". Menu paths are for OPNsense 24.x / 25.x.
 */
import type { Snippet, SnippetKey } from '../types';

export const snippets: Record<SnippetKey, Snippet> = {
  // ---------------------------------------------------------------- Proxmox
  proxmoxNetwork: {
    title: 'Proxmox: /etc/network/interfaces',
    lang: 'shell',
    code: `# /etc/network/interfaces on the Proxmox VE host (ifupdown2)
auto lo
iface lo inet loopback

# Built-in NIC. Example name: check yours with \`ip -br link\`.
auto enp1s0
iface enp1s0 inet manual

# USB NIC. USB adapters get MAC-based names like enx<mac>; yours will differ.
auto enx001122334455
iface enx001122334455 inet manual

# vmbr0 = LAN bridge on the built-in NIC.
# The host's management IP lives here (untagged = VLAN 1 on the switch).
# VLAN-aware so tagged VLAN 30 frames from the switch trunk reach the VM.
auto vmbr0
iface vmbr0 inet static
        address 192.168.1.10/24
        gateway 192.168.1.1
        bridge-ports enp1s0
        bridge-stp off
        bridge-fd 0
        bridge-vlan-aware yes
        bridge-vids 2-4094

# vmbr1 = WAN bridge on the USB NIC, cabled to the ARRIS modem.
# No IP on purpose: the host must never have an address on the internet side.
# Only the OPNsense VM (vtnet1) gets the public IP via ISP DHCP.
auto vmbr1
iface vmbr1 inet manual
        bridge-ports enx001122334455
        bridge-stp off
        bridge-fd 0

# Apply with: ifreload -a
#
# OPNsense VM NICs (qm config <vmid>), both VirtIO, no VLAN tag set:
#   net0: virtio=<mac>,bridge=vmbr0     -> vtnet0 (LAN + VLAN 30 trunk)
#   net1: virtio=<mac>,bridge=vmbr1     -> vtnet1 (WAN)`,
    note:
      'USB NICs are the weak link: use a solid chipset (e.g. Realtek RTL8153/RTL8156 or ASIX AX88179), a short cable, a rear USB 3 port, and disable USB autosuspend if the link drops. Leaving the VM NIC untagged on a VLAN-aware bridge lets the VM see untagged LAN plus tagged VLAN 30.',
  },

  // ---------------------------------------------------------------- OPNsense
  opnsenseInterfaces: {
    title: 'OPNsense: WAN and LAN',
    lang: 'opnsense',
    code: `Interfaces ▸ Assignments
  WAN  -> vtnet1   (VirtIO NIC on vmbr1, USB NIC, cabled to the modem)
  LAN  -> vtnet0   (VirtIO NIC on vmbr0, built-in NIC, cabled to switch Gi1/0/1)

Interfaces ▸ [WAN]
  Enable                      : checked
  IPv4 Configuration Type     : DHCP
  Block private networks      : checked
  Block bogon networks        : checked
  -> ISP DHCP hands out the public IP, e.g. 203.0.113.45 (documentation example)
     The ARRIS is a pure modem, so the public IP lands directly on vtnet1.

Interfaces ▸ [LAN]
  Enable                      : checked
  IPv4 Configuration Type     : Static IPv4
  IPv4 address                : 192.168.1.1 / 24
  IPv4 Upstream Gateway       : none (leave blank; never set a gateway on LAN)
  Block private networks      : unchecked (LAN *is* a private network)

Interfaces ▸ Settings
  Hardware CRC / TSO / LRO    : disabled (the defaults; recommended with VirtIO)`,
    note:
      'Cable modems often bind to the first MAC they see: after swapping what is plugged into the ARRIS, power-cycle the modem so OPNsense gets a lease.',
  },

  opnsenseOutboundNat: {
    title: 'OPNsense: outbound NAT',
    lang: 'opnsense',
    code: `Firewall ▸ NAT ▸ Outbound
  Mode: Automatic outbound NAT rule generation

  OPNsense generates the rules itself, one per internal subnet, roughly:
    Interface  Source             Translation
    WAN        192.168.1.0/24     WAN address (203.0.113.45)
    WAN        192.168.30.0/24    WAN address (203.0.113.45)   <- appears once
                                                                   the IOT interface exists
  Nothing to add for VLAN 30: automatic mode picks up every
  enabled internal interface's subnet.

# Illustrative pf equivalent (what the generated rule amounts to):
#   nat on vtnet1 inet from 192.168.1.0/24  to any -> (vtnet1) port 1024:65535
#   nat on vtnet1 inet from 192.168.30.0/24 to any -> (vtnet1) port 1024:65535`,
    note:
      'Only switch to Hybrid or Manual mode if you need custom rules (e.g. a static source port for a game console); Manual stops auto-adding new subnets.',
  },

  opnsenseVlan30: {
    title: 'OPNsense: VLAN 30 (IOT) + DHCP',
    lang: 'opnsense',
    code: `1) Create the VLAN device
Interfaces ▸ Devices ▸ VLAN  (older releases: Interfaces ▸ Other Types ▸ VLAN)
  Parent      : vtnet0 (LAN)
  VLAN tag    : 30
  Description : IOT
  -> OPNsense names the device itself (e.g. vlan01 or vtnet0_vlan30, depending
     on version). This explainer calls it vtnet0.30.

2) Assign it
Interfaces ▸ Assignments
  New interface: the VLAN 30 device  ->  Add  ->  rename OPTx to IOT

3) Address it
Interfaces ▸ [IOT]
  Enable                  : checked
  IPv4 Configuration Type : Static IPv4
  IPv4 address            : 192.168.30.1 / 24

4) DHCP for IOT
Services ▸ ISC DHCPv4 ▸ [IOT]   (named "DHCPv4" before 24.7)
  Enable      : checked
  Range       : 192.168.30.100 - 192.168.30.200
  DNS servers : (blank = hand out 192.168.30.1, Unbound on the firewall)
  Static mapping (bottom of the page, +):
    MAC address : <tent hub MAC>
    IP address  : 192.168.30.20   (outside the pool)
    Hostname    : tent-hub

  Newer installs may use Kea (Services ▸ Kea DHCP ▸ Kea DHCPv4) or, from 25.7,
  Dnsmasq (Services ▸ Dnsmasq DNS & DHCP). Same subnet, pool and reservation,
  different screens.`,
    note:
      'The tagged frames only arrive if the switch trunks VLAN 30 on Gi1/0/1 and the Proxmox bridge vmbr0 is VLAN-aware.',
  },

  opnsenseIotRules: {
    title: 'OPNsense: IOT firewall rules',
    lang: 'opnsense',
    code: `Firewall ▸ Rules ▸ IOT
  Interface rules are evaluated top to bottom, first match wins. They filter
  traffic entering the firewall on IOT (direction: in), i.e. sourced from the
  tent devices. Pass rules are stateful: replies flow back automatically, so
  no return rules are needed. Anything not matched is dropped by the default
  deny. With the DHCP server enabled on IOT, OPNsense adds the DHCP
  (UDP 67/68) allow rules itself.

  #  Action  Proto    Source    Destination    Port     Description
  1  Pass    TCP/UDP  IOT net   IOT address    53       DNS to Unbound
  2  Pass    UDP      IOT net   IOT address    123      NTP (optional, if the
                                                         NTP service is enabled)
  3  Block   any      IOT net   LAN net        *        No IoT into the LAN
  4  Block   any      IOT net   This Firewall  *        No GUI (443/80), SSH or
                                                         other firewall services
  5  Pass    any      IOT net   any            *        Internet

  Order matters: 1-2 sit above 4 because "This Firewall" includes 192.168.30.1.
  Rule 3 already covers 192.168.1.1 (it is inside LAN net); rule 4 adds the
  firewall's other addresses: 192.168.30.1 itself (GUI on 443/80, SSH) and the
  WAN address 203.0.113.45, which rule 5 would otherwise pass.
  Rule 5 must stay last, or it would pass IoT into the LAN.

  The LAN can still open connections to IoT devices (LAN's default
  "allow LAN to any" rule), and the replies return via state.

# Illustrative pf equivalent (not the exact generated ruleset):
#   pass  in quick on $iot proto { tcp udp } from 192.168.30.0/24 to 192.168.30.1 port 53  keep state
#   pass  in quick on $iot proto udp         from 192.168.30.0/24 to 192.168.30.1 port 123 keep state
#   block in quick on $iot from 192.168.30.0/24 to 192.168.1.0/24
#   block in quick on $iot from 192.168.30.0/24 to (self)
#   pass  in quick on $iot from 192.168.30.0/24 to any keep state`,
    note:
      'Block rather than Reject is fine here; use Reject if you want IoT apps to fail fast instead of timing out.',
  },

  // ---------------------------------------------------------------- Cisco IOS XE
  iosBaseline: {
    title: 'Catalyst 3650: baseline',
    lang: 'ios',
    code: `! Cisco Catalyst 3650-24PS (WS-C3650-24PS), IOS XE, global config mode
hostname SW1
!
ip domain name home.arpa
! (older trains: ip domain-name home.arpa)
!
vlan 1
 name LAN
!
interface Vlan1
 description Management (LAN 192.168.1.0/24)
 ip address 192.168.1.3 255.255.255.0
 no shutdown
!
! Layer 2 switch: default gateway for the switch's own traffic.
! 3650s often ship with ip routing on, which makes ip default-gateway a no-op.
no ip routing
ip default-gateway 192.168.1.1
!
! SSH v2 with a local user
username admin privilege 15 secret <strong-password>
ip ssh version 2
!
line vty 0 15
 login local
 transport input ssh
!
end
! Back in privileged EXEC: generate the SSH host key, then save
crypto key generate rsa modulus 2048
write memory`,
    note:
      'ip default-gateway is ignored when ip routing is enabled (check: show running-config | include ip routing), hence no ip routing above. If you need routing to stay on, skip no ip routing and use ip route 0.0.0.0 0.0.0.0 192.168.1.1 instead. Also note the dedicated Gi0/0 management port lives in Mgmt-vrf; this setup uses in-band VLAN 1 instead.',
  },

  iosPort1Access: {
    title: 'Gi1/0/1: access port to OPNsense',
    lang: 'ios',
    code: `interface GigabitEthernet1/0/1
 description Uplink to OPNsense LAN (vtnet0 via Proxmox vmbr0)
 switchport mode access
 switchport access vlan 1
 spanning-tree portfast
end`,
    note:
      'PortFast is fine here: the far end is a firewall behind a Linux bridge with STP off, not another switch, so the port skips the ~30 s listening/learning delay. Add spanning-tree bpduguard enable if you want the port shut down should a switch ever get plugged in.',
  },

  iosPort1Trunk: {
    title: 'Gi1/0/1: trunk to OPNsense (VLAN 1 + 30)',
    lang: 'ios',
    code: `interface GigabitEthernet1/0/1
 description Trunk to OPNsense (untagged LAN, tagged VLAN 30)
 switchport mode trunk
 switchport trunk native vlan 1
 switchport trunk allowed vlan 1,30
 switchport nonegotiate
 spanning-tree portfast trunk
end
!
! Verify
show interfaces trunk
show interfaces gi1/0/1 switchport`,
    note:
      'No "switchport trunk encapsulation dot1q" on a 3650: it only supports 802.1Q, so the command does not exist. Native VLAN 1 stays untagged and matches vtnet0 (LAN); VLAN 30 arrives tagged and matches the VLAN device on vtnet0. Plain "spanning-tree portfast" has no effect on a trunk; use the "trunk" keyword.',
  },

  iosOrbiPort: {
    title: 'Gi1/0/2: access port to the Orbi (yellow)',
    lang: 'ios',
    code: `interface GigabitEthernet1/0/2
 description Orbi (yellow)
 switchport mode access
 switchport access vlan 1
 spanning-tree portfast
 ! optional: the Orbi runs on its own power adapter, so skip PoE detection
 power inline never
end`,
    note:
      'power inline never is optional; the 3650-24PS only powers devices that present a valid PoE signature, so leaving it on is harmless.',
  },

  iosPcPort: {
    title: 'Gi1/0/4: access port to the PC (grey)',
    lang: 'ios',
    code: `interface GigabitEthernet1/0/4
 description PC (grey)
 switchport mode access
 switchport access vlan 1
 spanning-tree portfast
end`,
    note: 'The PC gets 192.168.1.50 from OPNsense DHCP (or a reservation) on VLAN 1.',
  },

  iosTentAccessPort: {
    title: 'Gi1/0/10: access port to the tent hub (VLAN 30)',
    lang: 'ios',
    code: `interface GigabitEthernet1/0/10
 description Grow tent hub (IOT)
 switchport mode access
 switchport access vlan 30
 switchport nonegotiate
 spanning-tree portfast
 spanning-tree bpduguard enable
 ! optional: allow only the hub's MAC on this port
 switchport port-security
 switchport port-security maximum 1
 switchport port-security mac-address sticky
 switchport port-security violation restrict
end`,
    note:
      'The hub sends untagged frames; the switch puts them in VLAN 30 and tags them toward OPNsense on the Gi1/0/1 trunk. The hub gets its reserved 192.168.30.20 via DHCP.',
  },

  iosVlan30: {
    title: 'VLAN 30 (IOT)',
    lang: 'ios',
    code: `vlan 30
 name IOT
end
!
! Verify
show vlan brief`,
    note:
      'No interface Vlan30 SVI on the switch: OPNsense (192.168.30.1) is the gateway, so IoT traffic must cross the firewall to go anywhere.',
  },

  iosLinkTroubleshoot: {
    title: 'Link down on Gi1/0/2: troubleshooting',
    lang: 'ios',
    code: `! Exec mode (privileged, "SW1#")
show interfaces status
!   look for Gi1/0/2: connected / notconnect / err-disabled / disabled
show interfaces gi1/0/2
!   "line protocol is down (notconnect)", speed/duplex, input errors, CRC
show interfaces gi1/0/2 counters errors
show interfaces status err-disabled
show errdisable recovery
show logging | include Gi1/0/2
!   %LINK-3-UPDOWN / %LINEPROTO-5-UPDOWN messages and flap times
show power inline gi1/0/2
!
! Neighbors: Cisco gear speaks CDP; the Orbi most likely does not.
show cdp neighbors
! LLDP is off by default on IOS XE; enable it first (global config):
!   lldp run
show lldp neighbors
!
! Cable test (TDR), supported on the 3650's copper ports.
! It interrupts the link for a few seconds while it runs.
test cable-diagnostics tdr interface gi1/0/2
show cable-diagnostics tdr interface gi1/0/2
!   per pair: Normal / Open / Short, with approximate distance to the fault
!
! Bounce the port (also clears err-disabled once the cause is fixed)
configure terminal
 interface gi1/0/2
  shutdown
  no shutdown
 end`,
    note:
      'Work up from layer 1: if TDR shows an Open pair or the port stays notconnect with a known-good cable, check that the cable is in the Orbi\'s Internet (WAN) port and the Orbi is powered and booted.',
  },

  // ---------------------------------------------------------------- Orbi
  orbiApMode: {
    title: 'Orbi: AP mode (how this Orbi is set up)',
    lang: 'text',
    code: `1. On a device connected to the Orbi, browse to http://orbilogin.com
   (or the Orbi's IP) and log in with the admin password.
2. Advanced ▸ Advanced Setup ▸ Router / AP Mode
3. Select "AP Mode".
4. IP address: "Get dynamically from existing router" (simplest), or
   "Enable fixed IP settings": 192.168.1.2 / 255.255.255.0, gateway and DNS
   192.168.1.1.
5. Apply. The Orbi reboots; satellites re-sync on their own.
6. In OPNsense, reserve 192.168.1.2 for the Orbi's MAC (static DHCP mapping on
   LAN) so its address never changes.

What changes:
  - The Orbi stops running DHCP, NAT and its firewall; it becomes a bridge
    between WiFi and the wired LAN.
  - WiFi clients get 192.168.1.x addresses from OPNsense and sit on the same
    LAN as the PC (192.168.1.50).
  - One NAT (OPNsense) instead of two; OPNsense sees and filters every client.
  - Manage it afterwards at http://192.168.1.2 (orbilogin.com may still resolve
    while connected to Orbi WiFi).`,
    note:
      'The cable on switch Gi1/0/2 goes into the Orbi router\'s Internet port, which on many Orbi models is the yellow one. That may be why the cable is yellow, but cable colour has no technical meaning.',
  },

  orbiRouterMode: {
    title: 'Orbi: router mode (factory default, not used here)',
    lang: 'text',
    code: `In router mode the Orbi acts as a second home router:
  WAN side : 192.168.1.2, a client on the OPNsense LAN (via switch Gi1/0/2)
  LAN side : its own DHCP server, gateway 10.0.0.1, clients in 10.0.0.0/24
  NAT      : rewrites 10.0.0.x -> 192.168.1.2 before forwarding upstream

Path of a laptop's packet to the internet:
  laptop 10.0.0.23 --NAT #1 (Orbi)--> 192.168.1.2 --NAT #2 (OPNsense)--> 203.0.113.45

Why 10.0.0.0/24: the Orbi's factory LAN is 192.168.1.1/24. When its WAN gets
an address in the same 192.168.1.x range, the Orbi detects the conflict and
moves its own LAN to a different subnet (10.0.0.1 here). It can also be set by
hand under Advanced ▸ Setup ▸ LAN Setup.

Side effects of double NAT:
  - WiFi clients cannot be reached from the wired LAN (the PC cannot see the
    laptop) and discovery (mDNS, casting, printers) does not cross the Orbi.
  - Port forwards and UPnP have to be done twice, and OPNsense sees every
    WiFi client as the single address 192.168.1.2.
  - Some games and VoIP report "strict NAT".`,
    note: 'This is why this Orbi runs in AP mode: OPNsense stays the only router.',
  },
};
