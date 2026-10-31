import { Label } from '../components/ui/label';
import { useJob } from '../../state/JobContext';

export function QuestionsBox() {
  const { jobInputs, setQuestions } = useJob();

  if (!jobInputs.selectedOutputs.includes('ANSWERS')) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="application-questions" className="text-sm font-semibold text-foreground">
        Application questions
      </Label>
      <p className="text-xs text-muted-foreground">
        Paste the questions you need answered, one per line or numbered (for example 'Tell me about a time when…'). You can also attach a screenshot of them in the job context area above.
      </p>
      <textarea
        id="application-questions"
        rows={4}
        value={jobInputs.questions}
        onChange={(e) => setQuestions(e.target.value)}
        placeholder="1. Why do you want to work here?&#10;2. Tell me about a time when you solved a hard data problem."
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y min-h-[100px]"
      />
    </div>
  );
}
