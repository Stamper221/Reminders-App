import { UploadWizard } from "@/components/finance/UploadWizard";
import { InsightsDashboard } from "@/components/finance/InsightsDashboard";
import { TransactionsPreview } from "@/components/finance/TransactionsPreview";

export default function AnalyzePage() {
    return (
        <div className="space-y-6">
            <div className="mb-10">
                <UploadWizard />
            </div>

            <div className="space-y-10">
                <InsightsDashboard />
                <TransactionsPreview />
            </div>
        </div>
    );
}
