export default function Page({ params }: { params: { lastWatermark: string } }) {
  return <div>{params.lastWatermark}</div>;
}
