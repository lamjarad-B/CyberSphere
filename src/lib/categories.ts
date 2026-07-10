import { db } from "@/lib/db";
import type { CategoryOption } from "@/components/admin/article-form";

/** Liste aplatie des catégories pour les <select>, sous-catégories indentées. */
export async function categoryOptions(): Promise<CategoryOption[]> {
  const tops = await db.category.findMany({
    where: { parentId: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    include: { children: { orderBy: [{ position: "asc" }, { name: "asc" }] } },
  });

  return tops.flatMap((top) => [
    { id: top.id, label: top.name },
    ...top.children.map((child) => ({
      id: child.id,
      label: `${top.name} / ${child.name}`,
    })),
  ]);
}
