import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function confirm(question: string, defaultNo: boolean = true): Promise<boolean> {
  const answer = (await ask(question)).toLowerCase();
  if (!answer) {
    return !defaultNo;
  }
  return ["y", "yes"].includes(answer);
}
