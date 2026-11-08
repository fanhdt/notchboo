import TextItemList from "../../components/shelf/TextItemList";

export default function ShelfNotes({ query, pinnedOnly }: { query: string; pinnedOnly: boolean }) {
  return <TextItemList kind="note" query={query} pinnedOnly={pinnedOnly} />;
}
