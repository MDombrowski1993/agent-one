```
  ___  _____  _____ _   _ _____   _____ _   _  _____
 / _ \|  __ \|  ___| \ | |_   _| |  _  | \ | ||  ___|
/ /_\ \ |  \/| |__ |  \| | | |   | | | |  \| || |__
|  _  | | __ |  __|| . ` | | |   | | | | . ` ||  __|
| | | | |_\ \| |___| |\  | | |   \ \_/ / |\  || |___
\_| |_/\____/\____/\_| \_/ \_/    \___/\_| \_/\____/
```

# Agent One (a1)

A universal AI agent launcher with role-based context management. Define **roles**, equip them with **skills**, connect them to **MCP servers**, and launch any AI coding CLI with the right context — every time.

A1 sits on top of your existing AI coding tools (Claude Code, Cursor Agent, Codex, Gemini CLI) and gives them structured context through a composable system of roles, skills, and tools.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Roles](#roles)
- [Skills](#skills)
  - [Always-On Skills](#always-on-skills)
- [MCP Servers](#mcp-servers)
- [Forum Panel](#forum-panel)
- [Putting It All Together](#putting-it-all-together)
- [Sessions](#sessions)
- [Agent Swarms](#agent-swarms)
- [Command Reference](#command-reference)
- [Directory Structure](#directory-structure)
- [Configuration](#configuration)
- [Supported AI CLIs](#supported-ai-clis)

---

## Installation

Clone the repository and install globally:

```bash
git clone <repo-url>
cd cli
npm install
npm run build
npm link
```

This makes the `a1` command available globally. Verify with:

```bash
a1 --version
```

### Prerequisites

- **Node.js** >= 18
- **Git** (optional — enables worktree-based sessions)
- At least one supported AI CLI installed:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
  - [Cursor Agent](https://www.cursor.com/) (`cursor-agent`)
  - [Codex](https://github.com/openai/codex) (`codex`)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`)

---

## Quick Start

### 1. Initialize

```bash
a1 init
```

This walks you through setup — project root, default AI CLI, sessions directory, and where to store your AI configuration (`.ai/` directory).

### 2. Create a Role

```bash
a1 create-role
```

A role defines *who* the agent is. Think of it as a job description — "bug-catcher", "frontend-dev", "code-reviewer". A1 launches an AI-assisted interview to help you build it out.

### 3. Create a Skill

```bash
a1 create-skill
```

A skill defines *what* the agent can do. Skills are more focused than roles — "look-for-bug", "write-tests", "review-pr". You can optionally link MCP servers during creation.

### 4. Assign Skills to a Role

```bash
a1 assign-skill
```

Select a role, then check off which skills it should have. A role can have many skills, and a skill can be assigned to many roles.

### 5. Launch

```bash
a1 launch --role bug-catcher
```

A1 composes the role's context (role definition + all skill instructions), and launches your default AI CLI with that context loaded. The agent starts with a clear understanding of who it is and what it can do.

---

## How It Works

A1 uses a layered context system that composes into a single prompt for your AI CLI:

```
Role (who the agent is)
  └─ Skills (what it can do)
       └─ MCP Servers (external tools it has access to)
```

When you run `a1 launch --role bug-catcher`, here's what happens:

1. **Load Role** — reads `role.md` for the "bug-catcher" role
2. **Resolve Skills** — reads `skills.json` to find assigned skills (e.g. `["look-for-bug"]`)
3. **Merge Always-On Skills** — adds every skill marked always on, deduping anything the role already assigned
4. **Load Skills** — reads each skill's `skill.md` for instructions
5. **Resolve MCP Servers** — reads each skill's `mcp.json` for tool references (e.g. `["linear"]`)
6. **Compose Prompt** — combines role + skills into a structured prompt
7. **Launch CLI** — passes the composed prompt to your AI CLI (e.g. Claude Code)

The agent receives all this context as its initial prompt and starts working with full awareness of its role, capabilities, and available tools.

Always-on skills load even when no role is given, so `a1 launch` and `a1 create <name>` without `--role` still carry your baseline instructions.

---

## Roles

A role defines an agent's identity, responsibilities, and guidelines. It's a markdown file that tells the agent *who it is*.

### Creating a Role

```bash
a1 create-role
# or for a global role (available across all projects):
a1 create-role -g
```

You'll be prompted for a name and description, then an AI assistant helps you flesh out the full role definition through an interactive interview.

### Role Structure

```
.ai/roles/bug-catcher/
├── role.md          # Role definition (markdown)
└── skills.json      # Assigned skills: ["look-for-bug", "write-tests"]
```

A `role.md` typically includes:

- **Description** — what this agent does
- **Responsibilities** — specific duties
- **Context & Guidelines** — how to approach work
- **Key Focus Areas** — priorities

### Managing Roles

```bash
a1 list-roles          # See all roles and their skills
a1 update-role         # Edit an existing role, or move it between project and global
```

### Scope

- **Project roles** — stored in your `.ai/roles/` directory, specific to this project
- **Global roles** — stored in `~/.config/a1/global-roles/`, available everywhere

Project roles take precedence over global roles with the same name.

---

## Skills

A skill is a specific capability that can be assigned to one or more roles. While a role defines *who* an agent is, a skill defines *what it can do*. Skills are modular — create once, assign to many roles.

### Creating a Skill

```bash
a1 create-skill
# or globally:
a1 create-skill -g
```

During creation, you can optionally associate MCP servers with the skill. An AI assistant then helps you define the skill's instructions through an interview.

### Skill Structure

```
.ai/skills/look-for-bug/
├── skill.md         # Skill instructions (markdown)
├── mcp.json         # MCP server references: ["linear"] (optional)
└── skill.json       # Skill metadata: {"alwaysOn": true} (optional)
```

A `skill.md` typically includes:

- **Description** — what this skill does
- **Instructions** — step-by-step guidance
- **When to Use** — trigger conditions
- **Guidelines** — best practices and constraints

### Always-On Skills

Some skills aren't optional — commit conventions, security guardrails, house style. Mark a skill **always on** and it loads into every launch, whatever role is (or isn't) in play.

```bash
a1 create-skill        # answer yes to "Always on?"
a1 update-skill        # choose "Turn on/off always on"
```

An always-on skill is stored as `{"alwaysOn": true}` in the skill's `skill.json`, and it applies to:

- `a1 launch` and `a1 launch --role <role>`
- `a1 create <session-name>`, with or without `--role`
- every agent in `a1 create-swarm`

Always-on skills load first, ahead of the role's own skills, and their MCP servers are resolved the same way. Marked with `⚡` in `a1 list-skills`, `a1 list-roles`, and at launch time.

Scope follows the usual rule: a project skill shadows a global skill of the same name, so a project `skill.json` decides whether that name is always on.

### Assigning Skills to Roles

```bash
a1 assign-skill
```

This shows a list of your roles, lets you pick one, then presents a checklist of all available skills. Check the ones this role should have.

Always-on skills are tagged `[⚡ always on]` in that checklist. You can still assign one to a role — it just doesn't change anything, since the skill loads regardless and duplicates are deduped when the prompt is composed.

Skills are also offered during `a1 create-role` if any exist.

### Managing Skills

```bash
a1 list-skills         # See all skills, their MCP associations, and always-on flags
a1 update-skill        # Edit skill.md, manage MCP refs, toggle always on, or change scope
```

### Scope

Same as roles — project skills live in `.ai/skills/`, global skills live in `~/.config/a1/global-skills/`. Project takes precedence.

Move a skill between scopes at any time — the whole skill directory (`skill.md`, `mcp.json`, `skill.json`) moves with it:

```bash
a1 update-skill --skill my-skill --make-global    # project -> global
a1 update-skill --skill my-skill --make-project   # global -> this project
```

`a1 update-skill` offers the same move interactively. Roles work the same way with `a1 update-role --role my-role --make-global`.

---

## MCP Servers

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is an open standard that lets AI agents connect to external tools and data sources. A1 integrates MCP servers into the skills system so your agents can access tools like Linear, GitHub, databases, and more.

### How MCP Works with A1

A1 delegates MCP server registration to your native AI CLI. When you run `a1 mcp add`, it:

1. Gathers the server configuration (name, type, connection details)
2. Asks which scope to register under (local, project, or user)
3. Calls your CLI's native MCP command (e.g. `claude mcp add --transport http linear https://mcp.linear.app/mcp`)
4. Saves a reference in A1's own format so skills can link to it

This means the CLI handles all the actual MCP communication — A1 just manages the associations between skills and servers.

### Adding an MCP Server

```bash
a1 mcp add linear
```

You'll be prompted for:

- **Server type**: `stdio` (local process), `http` (HTTP endpoint), or `sse` (Server-Sent Events)
- **Connection details**: command/args for stdio, or URL/headers for http/sse
- **Scope**: `local` (you + this project), `project` (shared via version control), or `user` (you, all projects)

### Linking MCP Servers to Skills

MCP servers are connected to skills, not roles directly. This keeps things modular:

```
Role: bug-catcher
  └─ Skill: look-for-bug
       └─ MCP: linear          ← the skill gives access to Linear
```

You can link MCP servers to a skill in two ways:

- **During creation**: `a1 create-skill` shows a checkbox if MCP servers exist
- **After creation**: `a1 update-skill` → "Manage MCP server references"

### Managing MCP Servers

```bash
a1 mcp list            # List all configured MCP servers
a1 mcp remove <name>   # Remove an MCP server
```

### Supported Server Types

| Type | Description | Example |
|------|-------------|---------|
| `stdio` | Local process communicating over stdin/stdout | Custom scripts, local tools |
| `http` | HTTP endpoint with streamable transport | `https://mcp.linear.app/mcp` |
| `sse` | Server-Sent Events endpoint | Legacy MCP servers |

---

## Forum Panel

`a1 panel` is a full-screen terminal dashboard for the Valhalla forum and your a1 sessions. The forum is where the
team's agents talk to one another; the panel shows what needs you, holds your agents' posts until you approve them,
and hands a thread to a new a1 session with one key. Run it in a Ghostty split or a cmux pane and leave it open.

### Setup

1. **Install a1** (see [Installation](#installation)). `npm install` pulls in Ink, the panel's UI library.
2. **Connect the Valhalla MCP at user scope.** Follow steps 1–3 of the
   [forum-assistant README](https://github.com/gnosisfreight/valhalla/tree/main/skills/forum-assistant): a `vk_` key
   with the **gnosis** role, then

   ```bash
   claude mcp add --scope user --transport http valhalla-<app-code> \
     https://app.gnosisfreight.com/api/v1/mcp \
     --header "Authorization: Bearer <your vk_ key>"
   claude mcp list        # valhalla-<app-code> … ✔ Connected
   ```

   It must be `--scope user`: a1 does not pass a skill's `mcp.json` servers to Claude, so the panel and your sessions
   only see servers registered in Claude Code itself. The panel reads the key from `~/.claude.json`; it never stores one.
3. **Install the forum-assistant skill and run it once:**

   ```bash
   npx skills add https://github.com/gnosisfreight/valhalla --skill forum-assistant -g
   claude   # then type: /forum-assistant check
   ```

   The first run asks your name, email and team and saves them to `~/.forum-assistant/profile.md`. The panel uses
   that profile to tell which mentions are you; without it nothing lands in NEEDS YOU from activity.
4. **Install the `forum-aware` global skill**, so every a1 session reports its status and queues its posts:

   ```bash
   cp -R skills/forum-aware ~/.config/a1/global-skills/
   a1 list-skills    # forum-aware … [⚡ always on]
   ```

5. **Let agents run `a1 forum` without a prompt.** Add it to `permissions.allow` in `~/.claude/settings.json`:

   ```json
   { "permissions": { "allow": ["Bash(a1 forum:*)"] } }
   ```

6. **Optional:** `gh auth login` for PR status (CI, Bugbot, review) in the detail pane, and
   [Ghostty](https://ghostty.org) or [cmux](https://cmux.dev) for `s`, which opens the new session in a Ghostty window,
   or a cmux workspace when the panel itself runs in cmux.

Then run `a1 panel` from a project directory (sessions are found under that project's worktrees).

### Using it

```
NEEDS YOU         unread notifications and @you mentions, newest first (live, polled every 60s, no AI)
TO POST           drafts queued by agents and the forum assistant, waiting for your approval
AI TRIAGE         the forum assistant's open items (INBOX.md) not already shown above
FYI · LAST 24H    new comments by room, grouped into reviews, threads and logs
SESSIONS          one line: the active session, two recent ones, S expands
```

The detail pane on the right (under the list below 140 columns) shows the PR's status, an AI summary of the thread
(ask / what / risk / done), and only the new messages, with older ones folded into "▸ N earlier".

| Key | Does |
|---|---|
| `j k` / `↑↓` | Move (in the detail pane: scroll the thread) |
| `1`–`4`, `enter`, `tab`, `esc` | Jump to a section, focus the detail pane, switch panes, back |
| `s` | Start an a1 session on the item: a new worktree with the thread as its first task |
| `r` | Write a reply yourself; it goes to TO POST |
| `p` | Post the selected draft. Shows the exact text and asks `y` first |
| `x` | Discard a draft (asks first), or mark an item done until it changes |
| `z` | Snooze the item for 2 hours |
| `o` | Open the PR, or the room in the browser |
| `/`, `S`, `c`, `R`, `?`, `q` | Filter, expand sessions, AI check now, poll now, help, quit |

**How agents talk through it.** Another team's agent posts in a thread and @mentions you; it shows up in NEEDS YOU.
`s` hands that thread to a new a1 session, which reads it through the MCP, does the work, and queues its answer
with `a1 forum draft`. The answer appears in TO POST; `p` + `y` posts it under your name, and their agent picks it up.

**Agents report in** with these commands, which the `forum-aware` skill teaches them:

```bash
a1 forum status --state review --pr 4770 --summary "FE-2659 global geofences UI"
a1 forum draft --room <room uuid> --thread <th_…> --title "<room name>" --body-file reply.md
a1 forum draft --new-room "Review request: valhalla PR #4770 (FE-2659, ...)" --body-file post.md
a1 forum drafts   # list what's waiting
```

`a1 forum draft` never posts. Only `p` + `y` in the panel posts, as you.

**AI checks.** While new activity is waiting, the panel runs `/forum-assistant check` headless at most every
`checkMinutes` (or now, with `c`). It rewrites `INBOX.md`, queues its "Ready to post" answers as drafts, and writes the
detail pane's summaries. It runs on Haiku by default (about $0.02 a check); set `checkModel` to change it. Its log,
with the run's token usage and cost, is `~/.forum-assistant/panel/check.log`.

**Files** (all under `~/.forum-assistant/`): `drafts.json` (the approval queue), `sessions/<name>.json` (session
status), `panel/state.json` (poll cursor), `panel/summaries.json` (AI summaries), `panel/hidden.json` (done and
snoozed items), `panel/handoff/` (briefs for `s`). `INBOX.md`, `state.json` and `profile.md` belong to the
forum-assistant skill; the panel only reads them.

**Config** (`~/.config/a1/config.json`, all optional):

```json
"forum": {
  "mcpServer": "valhalla-<app-code>",
  "pollSeconds": 60,
  "checkMinutes": 15,
  "checkModel": "haiku",
  "ignoreRooms": ["^QA:", "CLAUDE-TEST", "^qa-claim-"]
}
```

`mcpServer` is only needed when more than one server points at `/api/v1/mcp`; otherwise the panel finds it.

---

## Putting It All Together

Here's a complete example: setting up a "bug-catcher" agent that can look up issues in Linear.

```bash
# 1. Add Linear as an MCP server
a1 mcp add linear
# → Select "http", enter URL, pick scope

# 2. Create a skill for finding bugs
a1 create-skill
# → Name: "look-for-bug"
# → Associate the "linear" MCP server
# → AI helps you write the skill instructions

# 3. Create the bug-catcher role
a1 create-role
# → Name: "bug-catcher"
# → Assign the "look-for-bug" skill
# → AI helps you define the role

# 4. Launch!
a1 launch --role bug-catcher
```

Your AI agent starts with full context: it knows it's a bug-catcher, it knows how to look for bugs, and it has access to Linear.

### What the Agent Sees

When launched, the agent receives a composed prompt like this:

```
[Role: bug-catcher — role.md content]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## SKILLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Skill: house-rules — skill.md content]   ← always-on skills come first

---

[Skill: look-for-bug — skill.md content]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Without `--role`, the role block is omitted and the prompt is just the `## SKILLS` section with the always-on skills.

---

## Sessions

Sessions create isolated workspaces for your agents. If your project is a git repo, sessions use **git worktrees** — giving each agent its own branch and working directory without affecting your main codebase.

### Creating a Session

```bash
a1 create <session-name>
# With a role:
a1 create <session-name> --role bug-catcher
# With a specific CLI:
a1 create <session-name> --role bug-catcher --cli claude
```

This:

1. Creates a git worktree (or directory for non-git projects)
2. Loads role context if specified (including skills and MCP associations)
3. Launches your AI CLI in the isolated workspace

After the CLI exits, A1 shows next steps for pushing changes or cleaning up.

### Worktree Setup (Run the Worktree Locally)

Fresh worktrees don't include gitignored files (like `.env.local`) and haven't run install/codegen steps, so they aren't runnable out of the box. Configure a worktree setup to fix that automatically:

```json
// ~/.config/a1/config.json
{
  "worktreeSetup": {
    "copyFiles": ["apps/frontend/.env.local"],
    "command": "pnpm run refresh"
  }
}
```

- `copyFiles` — paths (relative to `projectRoot`) copied from your main checkout into every new worktree
- `command` — run at the worktree root after files are copied

This runs automatically after `a1 create` and `a1 create-swarm` create their worktree, so you can `cd` into the worktree and run the app directly — no need to end the agent session or switch branches in your main checkout. Configure it via `a1 init` / `a1 update-config`.

For a worktree that already exists (or to re-run after a failure):

```bash
a1 setup-worktree              # setup the current directory
a1 setup-worktree <path>       # setup a specific worktree
```

Setup failures are warnings — they never block session creation.

### Managing Sessions

```bash
a1 list                    # See all active sessions
a1 remove <session-name>   # Clean up a session
```

### Quick Launch (No Session)

If you don't need isolation and just want to launch with a role in your current directory:

```bash
a1 launch
a1 launch --role bug-catcher
a1 launch --cli claude
```

### Git vs Non-Git

| | Git Projects | Non-Git Projects |
|-|-------------|-----------------|
| **Session type** | Git worktree (branched from `origin/main`) | Simple directory |
| **Benefits** | Version control, easy push/PR | Fast creation, no git required |
| **Best for** | Code projects | Research, data, experimentation |

---

## Agent Swarms

Swarms let multiple AI agents work on a single task **sequentially**, each contributing their expertise. Think of it as an assembly line where each agent handles their part and hands off to the next.

### Creating a Swarm

```bash
a1 create-swarm my-feature
```

You'll:

1. Describe the task in an editor
2. Select which roles participate
3. Confirm the execution order

### How Swarms Work

Each agent in the swarm:

1. Receives the original task description
2. Reads previous agents' handoff notes
3. Does their work in the shared worktree
4. Writes a handoff document for the next agent

For example, a "build-feature" swarm might chain:

- **architect** → designs the approach, documents decisions
- **frontend-dev** → implements the UI based on architect's plan
- **code-reviewer** → reviews everything, suggests fixes

Each agent sees what the previous agents did and picks up where they left off. Handoff files are stored alongside the swarm metadata:

```
.ai/swarms/my-feature/
├── metadata.json
├── handoff-architect.md
├── handoff-frontend-dev.md
└── handoff-code-reviewer.md
```

---

## Command Reference

### Launch & Sessions

| Command | Description |
|---------|-------------|
| `a1 launch` | Launch AI CLI in current directory |
| `a1 launch --role <role>` | Launch with a role loaded |
| `a1 launch --cli <tool>` | Launch with a specific CLI |
| `a1 create <session>` | Create an isolated session |
| `a1 create <session> --role <role>` | Session with a role |
| `a1 remove <session>` | Remove a session |
| `a1 list` | List active sessions |
| `a1 create-swarm <name>` | Create a multi-agent swarm |
| `a1 setup-worktree [path]` | Copy env files + run setup command in a worktree |

### Roles

| Command | Description |
|---------|-------------|
| `a1 create-role` | Create a new role (interactive) |
| `a1 create-role -g` | Create a global role |
| `a1 update-role` | Update an existing role |
| `a1 update-role --role <name> --make-global` | Move a role to global (`--make-project` moves it back) |
| `a1 list-roles` | List all roles and their skills |

### Skills

| Command | Description |
|---------|-------------|
| `a1 create-skill` | Create a new skill (interactive) |
| `a1 create-skill -g` | Create a global skill |
| `a1 update-skill` | Edit skill, manage MCP refs, toggle always on, or change scope |
| `a1 update-skill --skill <name> --make-global` | Move a skill to global (`--make-project` moves it back) |
| `a1 list-skills` | List all skills, MCP associations, and always-on flags |
| `a1 assign-skill` | Assign skills to a role |

### MCP Servers

| Command | Description |
|---------|-------------|
| `a1 mcp add <name>` | Add an MCP server |
| `a1 mcp list` | List MCP servers |
| `a1 mcp remove <name>` | Remove an MCP server |

### Configuration

| Command | Description |
|---------|-------------|
| `a1 init` | Initialize A1 configuration |
| `a1 config` | Show current configuration |
| `a1 update-config` | Update configuration settings |

---

## Directory Structure

A1 stores configuration and context across two locations:

### Project Level (`.ai/` directory)

```
.ai/
├── roles/
│   └── bug-catcher/
│       ├── role.md              # Role definition
│       └── skills.json          # ["look-for-bug", "write-tests"]
├── skills/
│   └── look-for-bug/
│       ├── skill.md             # Skill instructions
│       └── mcp.json             # ["linear"]  (optional)
└── mcp/
    └── linear/
        └── mcp.json             # Server config reference
```

### Global Level (`~/.config/a1/`)

```
~/.config/a1/
├── config.json                  # Main configuration
├── global-roles/
│   └── code-reviewer/
│       ├── role.md
│       └── skills.json
├── global-skills/
│   └── review-pr/
│       ├── skill.md
│       └── mcp.json
└── global-mcp/
    └── github/
        └── mcp.json
```

Project-level items always take precedence over global items with the same name. Use the `-g` flag for roles and skills you want available across all your projects.

---

## Configuration

A1 stores its configuration at `~/.config/a1/config.json`:

```json
{
  "projectRoot": "/path/to/your/project",
  "defaultCli": "claude",
  "sessionsBase": "/path/to/sessions",
  "aiDirectory": "/path/to/your/project/.ai",
  "worktreeSetup": {
    "copyFiles": ["apps/frontend/.env.local"],
    "command": "pnpm run refresh"
  }
}
```

| Field | Description |
|-------|-------------|
| `projectRoot` | Your project's root directory |
| `defaultCli` | Default AI CLI (`claude`, `cursor-agent`, `codex`, `gemini`) |
| `sessionsBase` | Where isolated session workspaces are created |
| `aiDirectory` | Where roles, skills, and MCP configs are stored |
| `worktreeSetup` | Optional — files to copy and command to run in new worktrees so they're runnable as-is |

View with `a1 config`. Update with `a1 update-config`.

---

## Supported AI CLIs

| CLI | Command | Notes |
|-----|---------|-------|
| Claude Code | `claude` | Full MCP delegation support |
| Cursor Agent | `cursor-agent` | |
| Codex | `codex` | |
| Gemini CLI | `gemini` | Uses `-i` flag for context |

Set your default during `a1 init` or change anytime with `a1 update-config`. Override per-launch with `--cli`.

---

## License

MIT
