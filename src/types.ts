/**
 * Shared contract for the whole app. Every workstream codes against these
 * types. Change them only during integration.
 */

// ---------- Topology ----------

export type NodeId =
  | 'internet'
  | 'modem'
  | 'proxmox' // the mini PC host (drawn as a frame around opnsense)
  | 'opnsense'
  | 'switch'
  | 'orbi'
  | 'laptop' // a WiFi client behind the Orbi
  | 'pc'
  | 'tent-hub' // grow tent controller, wired to the switch (VLAN 30 when enabled)
  | 'tent-sensor'
  | 'tent-fan'
  | 'tent-light';

export type LinkId =
  | 'coax' // internet <-> modem (the ISP's cable plant)
  | 'wan' // modem <-> opnsense (via the USB NIC on the Proxmox host)
  | 'lan' // opnsense <-> switch port 1 (built-in NIC)
  | 'yellow' // switch <-> orbi
  | 'grey' // switch port 4 <-> pc
  | 'wifi' // orbi <-> laptop (wireless)
  | 'tent' // switch <-> tent-hub
  | 'tent-sensor' // tent-hub <-> tent-sensor
  | 'tent-fan' // tent-hub <-> tent-fan
  | 'tent-light'; // tent-hub <-> tent-light

export type NodeKind =
  | 'cloud'
  | 'modem'
  | 'host'
  | 'firewall'
  | 'switch'
  | 'ap'
  | 'client'
  | 'iot';

export interface TopoNode {
  id: NodeId;
  label: string;
  sublabel?: string;
  kind: NodeKind;
  /** Center position in SVG user units (full viewBox is 1040 x 640). */
  x: number;
  y: number;
}

export interface TopoLink {
  id: LinkId;
  a: NodeId;
  b: NodeId;
  /** Text shown on or near the link, e.g. "Gi1/0/4". */
  label?: string;
  /** Cable color, e.g. '#f2c200' for the yellow cable. */
  color?: string;
  style?: 'copper' | 'coax' | 'wireless' | 'usb';
  /** Where the label sits along the link, 0 = at `a`, 1 = at `b`. Default 0.5. */
  labelAt?: number;
}

/** A frame drawn around nodes, e.g. the Proxmox host around the OPNsense VM. */
export interface TopoFrame {
  id: NodeId;
  label: string;
  around: NodeId[];
}

export interface Topology {
  nodes: TopoNode[];
  links: TopoLink[];
  frames: TopoFrame[];
}

// ---------- Device side panel content ----------

export type SnippetLang = 'opnsense' | 'ios' | 'shell' | 'text';

export interface Snippet {
  title: string;
  lang: SnippetLang;
  code: string;
  /** Optional one-line note shown under the code. */
  note?: string;
}

/** Keys of the canonical config snippets in src/content/snippets.ts. */
export type SnippetKey =
  | 'proxmoxNetwork' // /etc/network/interfaces: vmbr0 (LAN, built-in NIC), vmbr1 (WAN, USB NIC)
  | 'opnsenseInterfaces' // WAN/LAN assignment + addressing
  | 'opnsenseOutboundNat' // automatic outbound NAT for LAN (and IoT)
  | 'opnsenseVlan30' // VLAN 30 device + IOT interface + DHCP
  | 'opnsenseIotRules' // IOT rules: block to LAN net, allow DNS, allow internet
  | 'iosBaseline' // hostname, VLAN 1 mgmt SVI, default gateway
  | 'iosPort1Access' // Gi1/0/1 as a plain access port (before VLANs)
  | 'iosPort1Trunk' // Gi1/0/1 as trunk, native VLAN 1, allowed 1,30
  | 'iosOrbiPort' // Gi1/0/2 (yellow) access port to the Orbi
  | 'iosPcPort' // Gi1/0/4 (grey) access port to the PC
  | 'iosTentAccessPort' // Gi1/0/10 access VLAN 30 for the tent hub
  | 'iosVlan30' // vlan 30 / name IOT
  | 'iosLinkTroubleshoot' // show interfaces status / counters / errdisable etc.
  | 'orbiApMode' // steps to switch the Orbi to AP mode
  | 'orbiRouterMode'; // what router mode does (its own DHCP/NAT)

export interface DeviceInfo {
  id: NodeId;
  name: string;
  model?: string;
  /** What it is, 1-3 sentences. */
  what: string;
  /** Why it's placed here in the network, 1-3 sentences. */
  why: string;
  facts?: { label: string; value: string }[];
  snippets?: Snippet[];
}

// ---------- Lessons ----------

export type ParamValue = boolean | string;
export type ParamValues = Record<string, ParamValue>;

export type Param =
  | {
      id: string;
      type: 'toggle';
      label: string;
      help?: string;
      default: boolean;
      onLabel?: string;
      offLabel?: string;
    }
  | {
      id: string;
      type: 'choice';
      label: string;
      help?: string;
      default: string;
      options: { value: string; label: string }[];
    };

export interface Action {
  id: string;
  label: string;
  description?: string;
}

export interface LessonState {
  params: ParamValues;
  /** The action the user last pressed, or null if none yet. */
  action: string | null;
}

export type LinkState = 'up' | 'down';
export type NodeState = 'normal' | 'hidden' | 'dim' | 'highlight' | 'warn';
export type Verdict = 'allow' | 'block' | 'nat';

export interface Flow {
  /** Ordered node ids the packet travels through. Consecutive nodes must share a link. */
  path: NodeId[];
  /**
   * allow: the packet reaches the end of the path.
   * nat:   allowed, and its source address is rewritten at each node in `natAt`.
   * block: the packet travels to the LAST node in `path`, turns red and stops there.
   *        (So a firewall block's path ends at 'opnsense'; a dead link's path ends at
   *        the last reachable node.)
   */
  verdict: Verdict;
  /** Nodes where NAT rewrites the source address (renderer flashes a "NAT" badge). */
  natAt?: NodeId[];
  /** Short label shown on the moving packet, e.g. "DNS", "HTTPS", "ping". */
  label?: string;
  /** Why it was blocked, shown at the stop point, e.g. "Rule: block IOT → LAN". */
  reason?: string;
}

export interface SolveResult {
  /** Links not listed are 'up'. Links touching a hidden node are hidden automatically. */
  links: Partial<Record<LinkId, LinkState>>;
  flows: Flow[];
  /** One plain sentence describing what is happening right now. */
  status: string;
  /** Nodes not listed are 'normal'. */
  nodes?: Partial<Record<NodeId, NodeState>>;
  /** Optional per-link label overrides, e.g. { lan: 'trunk: VLAN 1, 30' }. */
  linkLabels?: Partial<Record<LinkId, string>>;
  /** Optional bullet points shown under the status (e.g. troubleshooting steps). */
  details?: string[];
}

export interface Lesson {
  id: string;
  title: string;
  /** Plain text. Paragraphs separated by a blank line. */
  intro: string;
  params: Param[];
  actions: Action[];
  solve(state: LessonState): SolveResult;
  /**
   * Lesson-specific additions to a device's side panel, appended after the
   * base DeviceInfo (e.g. the IoT lesson adds the OPNsense IOT rules to 'opnsense').
   */
  deviceNotes?: Partial<Record<NodeId, { body?: string; snippets?: Snippet[] }>>;
}

// ---------- Stage API (implemented in src/stage/) ----------

export interface Stage {
  /** Redraw node/link states and (re)start flow animations for this result. */
  render(result: SolveResult): void;
  /** Replay the current flows from the start. */
  replay(): void;
  /** Called when a node or frame is clicked or activated by keyboard. */
  onSelect(cb: (id: NodeId) => void): void;
  /** Visually mark the selected node (null clears). */
  setSelected(id: NodeId | null): void;
}
