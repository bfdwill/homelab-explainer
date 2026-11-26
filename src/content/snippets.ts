// STUB: workstream D replaces this with accurate configs.
import type { Snippet, SnippetKey } from '../types';

const todo = (title: string): Snippet => ({ title, lang: 'text', code: 'TODO' });

export const snippets: Record<SnippetKey, Snippet> = {
  proxmoxNetwork: todo('Proxmox bridges'),
  opnsenseInterfaces: todo('OPNsense interfaces'),
  opnsenseOutboundNat: todo('OPNsense outbound NAT'),
  opnsenseVlan30: todo('OPNsense VLAN 30'),
  opnsenseIotRules: todo('OPNsense IOT rules'),
  iosBaseline: todo('Catalyst baseline'),
  iosPort1Access: todo('Gi1/0/1 access'),
  iosPort1Trunk: todo('Gi1/0/1 trunk'),
  iosOrbiPort: todo('Gi1/0/2 Orbi'),
  iosPcPort: todo('Gi1/0/4 PC'),
  iosTentAccessPort: todo('Gi1/0/10 tent'),
  iosVlan30: todo('VLAN 30'),
  iosLinkTroubleshoot: todo('Link troubleshooting'),
  orbiApMode: todo('Orbi AP mode'),
  orbiRouterMode: todo('Orbi router mode'),
};
