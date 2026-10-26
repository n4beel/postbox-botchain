import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";

export default function NotFound() {
  return (
    <PageShell>
      <div className="py-8">
        <Panel className="text-center py-12 space-y-4 bg-[#FFF6E8] border-[#7C140F]/30">
          <div className="text-4xl font-serif text-[#911611]">404</div>
          <h2 className="font-serif text-xl font-bold text-[#2B0F0D]">
            Message Not Found
          </h2>
          <p className="text-xs text-[#5C2E2B] max-w-xs mx-auto">
            The letter, account or inbox you are looking for does not exist on Postbox.
          </p>
          <div className="pt-4">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 text-xs font-semibold rounded-full bg-[#911611] text-[#FFF6E8] hover:bg-[#7C140F] transition-colors"
            >
              ← Back to public feed
            </Link>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
