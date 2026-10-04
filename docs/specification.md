# Project specification

## Overview

Duckling is a product workspace for a customer-facing web application composed of a TypeScript monorepo, a reusable shared package, and a front-end app shell. The project is intentionally staged so that the foundation is created first, then milestone-based feature work is added without skipping ahead.

## Architecture

- Root monorepo managed with npm workspaces
- `apps/web` contains the React + Vite application
- `packages/shared` contains shared types and utilities used by the app and future packages
- TypeScript project references are used for clean workspace builds
- Testing, linting, and formatting are configured at the monorepo level

## Milestones

### Milestone 1: Foundation and shell

Goal: establish the repository, workspace conventions, shared package, and a minimal application shell with passing tests.

Requirements:
- Create monorepo workspace structure
- Configure TypeScript builder references
- Create a web application with React and Vite
- Create at least one shared package for cross-app usage
- Add linting, formatting, and testing
- Add AGENTS.md and README documentation
- Implement a minimal home page and health-check content
- Ensure the project builds and tests pass

### Milestone 2: Product features

This milestone is intentionally out of scope for the current work. It includes additional product features beyond the bootstrapped foundation and should not be implemented until the repository is fully validated at milestone 1.

## Acceptance criteria

- A working monorepo can be installed with a single `npm install`
- The web app renders a minimal landing page and can run in development mode
- Shared package code is available to the web app without duplication
- Lint, format, and test commands run successfully
- Milestone 2 features are not added until milestone 1 is complete and verified
