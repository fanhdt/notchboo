import TextItemList from "../../components/shelf/TextItemList";

export default function ShelfSnippets({ query, pinnedOnly }: { query: string; pinnedOnly: boolean }) {
  return <TextItemList kind="snippet" query={query} pinnedOnly={pinnedOnly} />;
}
