import yaml from "js-yaml";
import pkg from "deep-diff";
const { diff } = pkg;
import { rules } from "../utils/rules.js";
import {
  estimateTime,
  calculateScore,
  optimizeYaml,
} from "../utils/timeCalculator.js";
import { detectExecutionFlow } from "../utils/execution.js";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey:
    process.env.PIPELINE_KEY ||
    "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",
});

console.log(process.env.PIPELINE_KEY);

export const analyzeYaml = async (req, res) => {
  try {
    const { yamlContent } = req.body;

    if (!yamlContent) {
      return res.status(400).json({ error: "YAML required" });
    }

    // Parse
    let parsed;
    try {
      parsed = yaml.load(yamlContent);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: "Invalid YAML format",
      });
    }

    let ai_suggestions;
    try {
      const completion = await openai.chat.completions.create({
      model: "meta-llama/llama-3.1-8b-instruct",
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content:
            `
You are a CI/CD expert.

Analyze the given YAML and return EXACTLY 5 suggestions.

Rules:
- Max 10 words each
- No explanations
- No numbering
- Return as plain lines only
`,
        },
        {
          role: "user",
          content: `Analyze this CI/CD YAML and suggest optimizations:\n\n${yamlContent}`,
        },
      ],
    });

    ai_suggestions = completion.choices[0]?.message?.content;
    } catch (error) {
      console.log("Error: ", error)
    }

    console.log(ai_suggestions)
   

    // Suggestions
    const suggestions = rules
      .filter((rule) => rule.check(parsed))
      .map((rule) => ({
        id: rule.id,
        message: rule.message,
        impact: rule.impact,
      }));

    // Time estimation
    const estimatedTime = estimateTime(parsed);

    // Score
    const score = calculateScore(suggestions);

    const execution = detectExecutionFlow(parsed);

    // Optimize
    const optimizedDoc = optimizeYaml(parsed, suggestions);

    // Convert back to YAML
    const optimizedYaml = yaml.dump(optimizedDoc);

    // Diff
    const differences = diff(parsed, optimizedDoc) || [];

    return res.json({
      success: true,
      parsed,
      estimatedTime,
      suggestions,
      ai_suggestions,
      execution,
      score,
      optimizedYaml,
      diff: differences,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }
};
