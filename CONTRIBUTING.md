# Contributing to SpecRails MCP

Thank you for your interest in contributing! This guide will help you get started.

## Prerequisites

- Node.js >= 20
- npm

## Development Setup

```bash
git clone https://github.com/specrails/specrails-mcp.git
cd specrails-mcp
npm install
npm run dev
```

## Running Tests

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — A new feature
- `fix:` — A bug fix
- `docs:` — Documentation changes
- `chore:` — Maintenance tasks
- `refactor:` — Code refactoring
- `test:` — Adding or updating tests

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes and commit using conventional commits
3. Open a PR against `main`
4. Ensure CI checks pass
5. Request review from a maintainer

## Code Style

This project uses ESLint and Prettier. Run `npm run lint` before submitting.

## Questions?

Open an issue or start a discussion. We're happy to help!
