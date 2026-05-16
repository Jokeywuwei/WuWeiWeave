interface MetricTileProps {
  label: string;
  value: string | number;
  detail: string;
}

export function MetricTile({ label, value, detail }: MetricTileProps) {
  return (
    <div className="rounded border border-stone-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-normal text-stone-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-neutral-950">{value}</div>
      <div className="mt-1 text-sm text-stone-600">{detail}</div>
    </div>
  );
}
