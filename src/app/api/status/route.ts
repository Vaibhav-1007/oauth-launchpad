import { missingServices } from "@/lib/research/config";
import { storageIsDurable, storageMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const missing = missingServices();
  return Response.json({
    liveResearch: missing.length === 0,
    missing,
    storage: storageMode(),
    durable: storageIsDurable(),
  });
}
