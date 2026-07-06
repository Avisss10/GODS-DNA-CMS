interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <p className="text-sm text-slate-600">Halaman ini akan dikembangkan pada tahap berikutnya.</p>
    </div>
  );
}
