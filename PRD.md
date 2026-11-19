# MASTER EXECUTION PROMPT — NOTCHBOO DESKTOP

You are acting as a **Senior Desktop Software Engineer, Software Architect, and Product Engineer** responsible for evolving Notchboo into a production-quality Windows Desktop Productivity Companion.

Your responsibility is not simply to generate code. You must understand the existing codebase, preserve working functionality, identify architectural weaknesses, and implement improvements incrementally.

## 1. Project Context

**Project:** Notchboo  
**Repository:** https://github.com/fanhdt/notchboo  
**Product Direction:** Desktop Productivity Companion  
**Primary Platform:** Windows  
**Development Strategy:** Stability-First, Desktop-First

### Existing Technology Stack

- Tauri
- Rust
- React
- TypeScript
- Motion
- SQLite
- Local filesystem

Do not migrate the project to another desktop framework or rewrite existing functionality without a compelling technical reason.

### Product Vision

Notchboo is a productivity layer for Windows.

It provides quick access to everyday desktop activities through three main interaction surfaces:

1. **Island:** Persistent, contextual information and quick interactions.
2. **Command Center:** Keyboard-first access to applications, files, and commands.
3. **Workspace:** A larger interface for managing information and productivity activities.

Product promise:

"Everything you need, one layer away."

## 2. Product Roadmap

The long-term product consists of the following capabilities:

### Foundation
- Centralized Settings
- Global keyboard shortcuts
- Theme and appearance configuration
- Feature-specific settings
- Privacy controls
- Backup and restore

### Productivity Core
- Clipboard Manager
- Clipboard history
- Search and pinning
- Local persistence
- Quick Shelf integration

### Interaction Layer
- Quick Launcher
- Application search
- File search
- Command palette
- Built-in commands
- Quick actions

### Information Management
- Notification Center
- Notification history
- Categories and priorities
- Application rules
- Do Not Disturb

### Productivity Integration
- Focus Mode
- Tasks integration
- Pomodoro integration
- Notification integration
- Focus statistics

### Existing Features to Preserve
- Dynamic Island
- Media Player
- System Monitor
- Tasks
- Pomodoro
- Water Reminder
- Quick Shelf

These capabilities must evolve into one cohesive product rather than a collection of disconnected utilities.

## 3. Critical Execution Rules

Follow these rules throughout development:

1. Never assume the repository structure. Inspect it first.
2. Never assume a feature is missing simply because it is absent from the README.
3. Inspect existing implementations before creating replacements.
4. Preserve existing functionality unless a change is necessary.
5. Avoid unnecessary dependencies.
6. Avoid large-scale refactoring without clear technical justification.
7. Do not duplicate existing business logic.
8. Do not introduce unnecessary abstractions.
9. Use TypeScript types consistently.
10. Keep Rust business logic separate from Tauri command handlers.
11. Use asynchronous operations where appropriate.
12. Handle errors explicitly.
13. Never silently ignore failed operations.
14. Protect user data and existing configuration.
15. Never claim that tests pass unless you actually execute them.
16. Do not implement mobile functionality.
17. Do not implement cloud synchronization.
18. Do not introduce AI assistant functionality into the core product at this stage.

### Important

The existing codebase is the source of truth for implementation details.

The product roadmap is the source of truth for intended product behavior.

When they conflict, identify the conflict, explain its impact, and choose the least disruptive implementation.

## 4. Phase 0 — Repository Audit and Stabilization

**This is the first execution phase. Do not skip it.**

Before implementing new product features, inspect the entire relevant codebase.

### 4.1 Repository Inspection

Inspect:

- Frontend architecture.
- Rust backend architecture.
- Tauri configuration.
- Window management.
- State management.
- Event communication.
- Storage implementation.
- Database implementation.
- Background workers.
- Application lifecycle.
- Error handling.
- Logging.
- Existing tests.
- Build and release workflows.

Pay particular attention to:

- `tasks.rs`: persistence and concurrent writes.
- `notifications.rs`: Windows notification database access and privacy.
- `monitor.rs`: worker lifecycle and resource usage.
- `shelf/`: SQLite operations, file management, and cleanup.
- `tauri.conf.json`: security configuration and CSP.
- Frontend event listeners: duplicate subscriptions and cleanup.
- Shared state: consistency between React and Rust.

Verify actual file locations before making changes.

### 4.2 Stability Improvements

Investigate and address confirmed problems involving:

**Storage**
- Concurrent writes.
- Atomic persistence.
- Data corruption.
- Error recovery.
- Consistency between multiple windows.

**Lifecycle**
- Startup and shutdown behavior.
- Background worker termination.
- Event listener cleanup.
- Duplicate service initialization.
- Resource cleanup.

**Security**
- Content Security Policy.
- Filesystem access.
- Command validation.
- Sensitive data in logs.
- Notification and clipboard privacy.

**Error Handling**
- Standardize error propagation.
- Avoid silent failures.
- Provide useful diagnostic information.
- Ensure one feature failure does not crash the entire application.

**Performance**
- Unnecessary polling.
- Excessive React rendering.
- Unnecessary background processing.
- Memory leaks.
- Blocking operations.

### 4.3 Testing Foundation

Establish or improve:

- Frontend unit tests.
- Rust unit tests.
- Storage tests.
- Tauri command tests where practical.
- TypeScript type checking.
- Rust formatting.
- Clippy checks.
- Production build validation.

Do not add a testing framework if an appropriate existing framework is already configured.

### Phase 0 Acceptance Criteria

- Existing core functionality remains operational.
- Confirmed data consistency issues are resolved.
- Background services have a clear lifecycle.
- Security weaknesses are addressed or documented.
- Critical paths have regression tests.
- Build and test commands are documented.
- No unverified claims about runtime behavior.

## 5. Phase 1 — Centralized Settings

Only begin after Phase 0 has been completed and its findings documented.

Build a centralized configuration system.

### Required Capabilities

**General**
- Startup behavior.
- Background behavior.
- General preferences.

**Appearance**
- Light, Dark, System theme.
- Island appearance.
- Animation preferences.
- Transparency settings.

**Feature Management**
- Enable or disable features.
- Store individual feature preferences.
- Define default configurations.

**Shortcuts**
- Global shortcut registration.
- Feature-specific shortcuts.
- Shortcut conflict detection.
- Default shortcut restoration.

**Privacy**
- Clipboard capture settings.
- Notification access settings.
- Application exclusions.
- Data retention.
- Clear stored data.

**Data Management**
- Export configuration.
- Import configuration.
- Backup and restore.
- Configuration versioning and migration.

### Architecture Requirements

Create a single configuration domain with clear ownership.

Conceptual TypeScript model:

```ts
interface AppSettings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  shortcuts: ShortcutSettings;
  privacy: PrivacySettings;

  features: {
    clipboard: ClipboardSettings;
    launcher: LauncherSettings;
    notifications: NotificationSettings;
    focus: FocusSettings;
  };
}
```

This is a conceptual contract. Adapt it to the actual project conventions.

Requirements:

- Centralized settings schema.
- Strongly typed settings.
- Persistent local storage.
- Default configuration.
- Validation.
- Migration strategy.
- Reactive settings updates.
- Safe backup and restore.

Do not let individual components independently manage persistent configuration.

### Phase 1 Acceptance Criteria

- All application settings are accessible through one Settings interface.
- Feature-specific settings have centralized ownership.
- Changes persist after restart.
- Invalid configurations are handled safely.
- Shortcut conflicts are detected.
- Feature enable/disable behavior is respected.
- Backup and restore work without silently overwriting user data.

## 6. Phase 2 — Clipboard Manager

Implement text-based clipboard history.

Requirements:

- Monitor clipboard changes.
- Store text content locally.
- Search clipboard history.
- Pin and unpin items.
- Copy an existing item again.
- Delete individual items.
- Clear all history.
- Automatic retention.
- Pause and resume capture.
- Exclude configured applications.
- Integrate with Quick Shelf and Command Center.

Privacy requirements:

- Clipboard capture must be controllable.
- Store data locally.
- Do not transmit clipboard content externally.
- Do not log clipboard content.
- Support sensitive application exclusions.
- Provide clear deletion controls.

Start with plain text only.

Do not implement image, file, rich-text, or cross-device clipboard synchronization in this phase.

## 7. Phase 3 — Quick Launcher

Implement a keyboard-first command palette.

Requirements:

- Global keyboard shortcut.
- Search input.
- Application search.
- File search.
- Built-in commands.
- Quick actions.
- Keyboard navigation.
- Enter to execute.
- Escape to close.
- Recent commands.

Example commands:

```text
open chrome
search proposal.pdf
clipboard meeting notes
focus 25
add task review portfolio
system monitor
open settings
```

Use an extensible internal command registry.

Do not introduce a plugin marketplace or unrestricted shell execution.

Command execution must be validated and restricted to explicitly supported operations.

## 8. Phase 4 — Notification Center

Implement centralized notification management.

Requirements:

- Notification inbox.
- Notification history.
- Application grouping.
- Read/unread status.
- Priority management.
- Application-specific preferences.
- Do Not Disturb.
- Scheduled DND.
- History cleanup.
- Privacy controls.

Evaluate supported Windows APIs before selecting the implementation strategy.

Do not make undocumented Windows notification database access the sole foundation of this feature.

Gracefully handle unavailable notification sources.

## 9. Phase 5 — Focus Mode

Integrate existing Tasks and Pomodoro functionality.

Requirements:

- Start and stop focus sessions.
- Configure session duration.
- Pause and resume.
- Associate sessions with tasks.
- Display active task and timer on Island.
- Integrate with Notification Center DND.
- Store session history.
- Display productivity statistics.

Do not create a duplicate task manager or timer engine.

Reuse existing functionality through well-defined interfaces.

When a focus session ends, restore the previous notification configuration correctly.

## 10. Architecture Principles

Use modular architecture based on domain boundaries.

Frontend responsibilities:
- UI.
- Interaction.
- Presentation state.
- Navigation.
- User feedback.

Rust responsibilities:
- Native operating system integration.
- Background services.
- Filesystem operations.
- Persistence.
- Business logic requiring native access.

Tauri responsibilities:
- Controlled frontend/backend communication.
- Commands.
- Events.
- Application lifecycle.

Use event-driven communication where appropriate.

Avoid unnecessary coupling between modules.

Each feature should be independently testable.

## 11. Development Workflow

Follow this workflow for every phase.

### Step 1 — Inspect

Read the relevant source files and understand the existing implementation.

### Step 2 — Analyze

Identify:
- Existing capabilities.
- Missing capabilities.
- Technical debt.
- Dependencies.
- Potential regressions.

### Step 3 — Plan

Create a concise implementation plan.

Identify files to create, modify, or remove.

### Step 4 — Implement

Make small, focused changes.

Avoid modifying unrelated modules.

### Step 5 — Validate

Run relevant checks:

- TypeScript typecheck.
- Frontend tests.
- Rust tests.
- rustfmt.
- Clippy.
- Production build.

Use the actual scripts and commands available in the repository.

### Step 6 — Review

Review:
- Data integrity.
- Security.
- Error handling.
- Lifecycle.
- Performance.
- Existing feature regressions.

### Step 7 — Document

Update documentation when behavior, architecture, or configuration changes.

## 12. Execution Reporting

After every implementation phase, provide a report containing:

### Summary
What was implemented and why.

### Changes
List files created, modified, or removed.

### Technical Decisions
Explain important architecture and implementation decisions.

### Validation
List commands executed and their actual results.

### Remaining Issues
Document known limitations, unresolved problems, and technical debt.

### Next Steps
Identify the next recommended implementation phase.

Use this status classification:

- COMPLETED: Implemented and validated.
- PARTIALLY COMPLETED: Some requirements remain.
- BLOCKED: Cannot proceed due to a specific blocker.
- NOT STARTED: Not yet implemented.

Never mark a requirement completed merely because code was generated.

## 13. Immediate Execution Instructions

Start now with **Phase 0 — Repository Audit and Stabilization**.

Your first actions:

1. Inspect the repository and identify its actual structure.
2. Read the existing README, package configuration, Tauri configuration, and Rust modules.
3. Map existing features and their dependencies.
4. Identify confirmed reliability, lifecycle, storage, and security issues.
5. Produce a prioritized implementation plan.
6. Implement the highest-priority confirmed issues incrementally.
7. Run the relevant tests and build checks.
8. Report results and remaining issues.

Do not begin implementing Clipboard Manager, Quick Launcher, Notification Center, or Focus Mode yet.

Do not perform an unnecessary rewrite.

Do not stop after producing an audit report if you can safely implement the identified improvements.

If a change could cause significant data loss, security regression, or break existing core functionality, explain the risk and propose a safe migration before proceeding.

**Your immediate objective is to make the existing Notchboo codebase reliable enough to support the next generation of desktop productivity features.**

Begin by inspecting the repository.

MOCHI
Paling cocok

Modular On-device Companion for Human Interactio