"use client";

import { useRouter, useSearchParams } from "next/navigation";

const sortingOptions = [
  { value: "price-asc", label: "Sort by price(asc)" },
  { value: "price-desc", label: "Sort by price(desc)" },
  { value: "created_at-asc", label: "Sort by created at(asc)" },
  { value: "created_at-desc", label: "Sort by created at(desc)" },
  { value: "rating-asc", label: "Sort by rating (asc)" },
  { value: "rating-desc", label: "Sort by rating (desc)" },
];

function SortBy() {
  const router = useRouter();
  const params: any = useSearchParams();
  const searchParams = new URLSearchParams(params);

  const currentSort = searchParams.get("sortBy") || "";

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    if (value) {
      searchParams.set("sortBy", value);
    } else {
      searchParams.delete("sortBy");
    }

    // Reset to first page when sorting changes
    searchParams.delete("page");

    // Update URL with new params without full reload (client-side navigation)
    router.push(`?${searchParams.toString()}`);
  };

  return (
    <div className="text-black flex gap-2">
      <p className="text-white text-lg">Sort By</p>
      <select name="sorting" id="sorting" value={currentSort} onChange={handleChange}>
        <option value="">None</option>
        {sortingOptions.map((option, i) => (
          <option key={i} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SortBy;
