# Apollo Web Dashboard

React-based web dashboard for Apollo, providing real-time visualization and control of the LOGOS agent.

## Status

⏳ **To be implemented in Epoch 3 (Task C4)**

The web dashboard will provide:

- Real-time visualization of agent state
- HCG graph visualization
- Plan monitoring and execution tracking
- Interactive command interface
- WebSocket-based real-time updates

## Technology Stack

- **React** 18+ with TypeScript
- **Vite** for build tooling and development server
- **React Router** for navigation
- **TanStack Query** for data fetching and state management
- **D3.js** and **Cytoscape.js** for graph visualization
- **Vitest** for testing
- **ESLint** and **Prettier** for code quality

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher

You can check your versions with:

```bash
node --version
npm --version
```

## Installation

Install dependencies:

```bash
cd webapp
npm install
```

This will install all required dependencies and devDependencies as defined in `package.json`.

> **Note:** The generated `@logos/sophia-sdk` and `@logos/hermes-sdk` packages are
> vendored under `webapp/vendor/@logos/*` (copied from
> [`c-daly/logos`](https://github.com/c-daly/logos) commit
> `9549b089203ed1d8bb6560ab56ba02e7dbbefb61`). If the OpenAPI contracts change,
> refresh these folders using the instructions in `webapp/vendor/README.md` to keep
> the snapshot in sync.

## Development

Start the development server:

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000` with hot module replacement enabled.

## Available Scripts

### Development

- `npm run dev` - Start development server with hot reload
- `npm run preview` - Preview production build locally

### Building

- `npm run build` - Build for production (outputs to `dist/`)
- `npm run type-check` - Run TypeScript type checking without emitting files

### Testing

- `npm test` - Run tests in watch mode
- `npm run test:ui` - Run tests with UI interface
- `npm run coverage` - Generate test coverage report

### Code Quality

- `npm run lint` - Check code for linting errors
- `npm run lint:fix` - Fix auto-fixable linting errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Project Structure

```
webapp/
├── src/                # Source code (to be created in Epoch 3)
│   ├── components/     # React components
│   ├── pages/         # Page components
│   ├── hooks/         # Custom React hooks
│   ├── services/      # API services
│   ├── utils/         # Utility functions
│   └── App.tsx        # Main app component
├── public/            # Static assets (to be created)
├── dist/              # Production build output (generated)
├── package.json       # npm configuration and dependencies
├── tsconfig.json      # TypeScript configuration
├── vite.config.ts     # Vite bundler configuration
├── vitest.config.ts   # Vitest test configuration
├── eslint.config.js   # ESLint linting rules
└── .prettierrc        # Prettier formatting rules
```

## Integration Points

The web dashboard will integrate with:

- **Sophia API**: For sending commands and receiving state updates
- **Neo4j**: For querying and visualizing the HCG
- **WebSocket**: For real-time state updates

## Dependency Management

This project uses **npm** for dependency management:

- **Dependencies**: Runtime libraries needed for the application
- **DevDependencies**: Build tools, linters, and testing frameworks
- **Lock File**: `package-lock.json` ensures reproducible builds

To add new dependencies:

```bash
# Runtime dependency
npm install <package-name>

# Development dependency
npm install --save-dev <package-name>
```

## Node.js Version

This project requires Node.js 18 or higher. The version is specified in:

- `package.json` under `engines.node`
- `.nvmrc` file in the project root (for nvm users)

If you use nvm, you can switch to the correct version with:

```bash
nvm use
```
