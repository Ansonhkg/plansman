import {TagGroup, Tag, Button} from "@heroui/react";

import {Iconify} from "../icons/iconify";
import {useTracker} from "../state/tracker";

export function FilterBar() {
  const {filters, removeFilter, clearFilters} = useTracker();

  if (filters.length === 0) return null;

  return (
    <div className="border-border/70 bg-background flex items-center gap-2 border-b px-3 py-1.5">
      <TagGroup
        aria-label="Active filters"
        className="min-w-0 flex-1"
        onRemove={(keys) => {
          for (const key of keys) removeFilter(String(key));
        }}
      >
        <TagGroup.List className="flex flex-wrap gap-1.5">
          {filters.map((filter) => (
            <Tag key={filter.id} id={filter.id} textValue={filter.label}>
              <span className="text-xs">{filter.label}</span>
            </Tag>
          ))}
        </TagGroup.List>
      </TagGroup>
      <Button
        className="text-muted shrink-0"
        size="sm"
        variant="ghost"
        onPress={clearFilters}
      >
        <Iconify className="size-3.5" icon="xmark" />
        Clear
      </Button>
    </div>
  );
}
