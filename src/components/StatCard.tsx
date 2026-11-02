export default function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-3 border border-line bg-bg-2 p-6">
      <p className="eyebrow mb-2">{label}</p>
      <p className={"title m-0 text-[34px] " + (accent ? "text-brand" : "")}>{value}</p>
      {hint && <p className="eyebrow mt-1.5 text-[10px]">{hint}</p>}
    </div>
  );
}
