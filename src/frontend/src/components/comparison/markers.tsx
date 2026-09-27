// Candidates are identified by letters rather than colors, so color stays
// reserved for the priority scale.

export function candidateLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function CandidateMarker({ index }: { index: number }) {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center bg-gray-800 font-mono text-[10px] font-semibold text-white" aria-hidden="true">
      {candidateLetter(index)}
    </span>
  );
}

export function ReferenceMarker() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center justify-center border border-gray-800 bg-white px-1 font-mono text-[10px] font-semibold text-gray-800" aria-hidden="true">
      REF
    </span>
  );
}
