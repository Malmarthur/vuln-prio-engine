import { Vulnerability } from '../api/client';

interface VulnRowProps {
  vuln: Vulnerability;
  expanded: boolean;
  onToggle: () => void;
}

const SEV_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  LOW: 'bg-blue-100 text-blue-700',
  NONE: 'bg-gray-100 text-gray-600',
};

const PRIORITY_BADGE: Record<string, string> = {
  V0: 'bg-red-100 text-red-700',
  V1: 'bg-orange-100 text-orange-700',
  V2: 'bg-yellow-100 text-yellow-800',
  V3: 'bg-green-100 text-green-700',
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  return new Date(d).toLocaleDateString();
}

function fmtEpss(v: number | null | undefined): string {
  if (v == null) return '\u2014';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtCvss(v: number | null | undefined): string {
  if (v == null) return '\u2014';
  return Number(v).toFixed(1);
}

function bestSeverity(v: Vulnerability): string | null {
  return v.cvss_v31_severity || v.cvss_v30_severity || v.cvss_v2_severity;
}

function bestCvss(v: Vulnerability): number | null {
  return v.cvss_v31_score ?? v.cvss_v30_score ?? v.cvss_v2_score;
}

export default function VulnRow({ vuln, expanded, onToggle }: VulnRowProps) {
  const sev = bestSeverity(vuln);
  const score = bestCvss(vuln);

  return (
    <tr
      onClick={onToggle}
      className={`cursor-pointer border-b border-gray-100 transition-colors ${
        expanded ? 'bg-gray-50' : 'hover:bg-gray-50'
      }`}
    >
      <td className="px-3 py-2 text-sm font-mono font-medium whitespace-nowrap">
        {vuln.cve_id ? (
          <span className="text-blue-700">{vuln.cve_id}</span>
        ) : vuln.euvd_id ? (
          <span className="text-purple-700">{vuln.euvd_id}</span>
        ) : (
          <span className="text-gray-300">&mdash;</span>
        )}
        {vuln.cve_id && vuln.euvd_id && (
          <span className="ml-1.5 text-xs text-purple-500 font-normal">EUVD</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-gray-700 max-w-md truncate">
        {vuln.summary || '\u2014'}
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {vuln.priority_level ? (
          <span
            className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
              PRIORITY_BADGE[vuln.priority_level] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {vuln.priority_level}
          </span>
        ) : (
          <span className="text-gray-300">&mdash;</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-right font-mono tabular-nums whitespace-nowrap">
        {vuln.priority_score != null ? vuln.priority_score.toFixed(1) : '\u2014'}
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {sev ? (
          <span
            className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
              SEV_BADGE[sev] || SEV_BADGE.NONE
            }`}
          >
            {sev}
          </span>
        ) : (
          <span className="text-gray-300">{'\u2014'}</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-right font-mono tabular-nums whitespace-nowrap">
        {fmtCvss(score)}
      </td>
      <td className="px-3 py-2 text-sm text-right font-mono tabular-nums whitespace-nowrap">
        {fmtEpss(vuln.epss_score)}
      </td>
      <td className="px-3 py-2 text-center text-sm whitespace-nowrap">
        {vuln.kev_known_exploited ? (
          <span className="text-red-600 font-medium" title="Known Exploited Vulnerability">
            KEV
          </span>
        ) : (
          <span className="text-gray-300">{'\u2014'}</span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-gray-500 whitespace-nowrap hidden md:table-cell">
        {fmtDate(vuln.published_date)}
      </td>
    </tr>
  );
}
