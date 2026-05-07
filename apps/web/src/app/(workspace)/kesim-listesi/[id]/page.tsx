import { CutListDetailPageClient } from "@/features/cut-lists/cut-list-detail-page-client";
import { readFlashMessage } from "@/lib/query";

type KesimListesiDetayPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    notice?: string;
  }>;
};

export default async function KesimListesiDetayPage({
  params,
  searchParams
}: KesimListesiDetayPageProps) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);

  return (
    <CutListDetailPageClient id={id} notice={readFlashMessage(notice) ?? undefined} />
  );
}
