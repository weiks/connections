# Connections

An AI-powered Connections word puzzle game inspired by the NYT original. Each puzzle is dynamically generated using Claude, mixing topics from finance, DC politics, soccer, sports betting, boating, 80s/90s trivia, foreign affairs, and current events — with devious cross-over words designed to trick you.

## Play

Visit the live site and add it to your home screen for an app-like experience.

## How it works

- 4 groups of 4 words, each from a different topic domain
- Words are chosen for maximum cross-over confusion
- Select 4 words to guess a group — auto-submits on the 4th pick
- "One away!" warning when you're close
- Final group requires you to *name* the connection
- Powered by the Anthropic API (Claude Sonnet)

## Development

```bash
npm install
npm run dev
```

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via the included workflow.
