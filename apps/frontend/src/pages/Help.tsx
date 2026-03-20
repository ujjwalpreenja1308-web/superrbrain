import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, HelpCircle, Mail, BookOpen } from "lucide-react";

const faqs = [
  {
    q: "What is AI Visibility Score?",
    a: "Your visibility score measures how often your brand is cited by AI engines (ChatGPT, Perplexity) across a set of search prompts relevant to your category. A higher score means AI is recommending you more often.",
  },
  {
    q: "How does the Gap Queue work?",
    a: "The gap queue shows Reddit threads where your competitors are mentioned by AI but your brand isn't. You can generate contextual Reddit comments to address these gaps and improve your AI visibility.",
  },
  {
    q: "What are Outcomes?",
    a: "Outcomes track whether the content you deployed actually closed the citation gap. When AI engines start citing the source where you posted, the gap is marked as closed.",
  },
  {
    q: "How often should I run monitoring?",
    a: "We recommend running monitoring at least weekly to keep your visibility score current and discover new gaps as they appear.",
  },
  {
    q: "What data do you collect?",
    a: "We only collect publicly available AI search responses and Reddit thread data. No private user data is scraped or stored beyond your account information.",
  },
];

export function Help() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Help</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Frequently asked questions and support
        </p>
      </div>

      <div className="space-y-2">
        {faqs.map((faq, i) => (
          <Collapsible key={i}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardContent className="flex items-center gap-3 py-3 cursor-pointer group">
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  <span className="text-sm font-medium text-left">{faq.q}</span>
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-4 pl-10">
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      <Card>
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center gap-3">
            <BookOpen className="size-4 text-muted-foreground" />
            <span className="text-sm">Documentation coming soon</span>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="size-4 text-muted-foreground" />
            <span className="text-sm">
              Contact support:{" "}
              <a href="mailto:support@covable.app" className="text-primary hover:underline">
                support@covable.app
              </a>
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
