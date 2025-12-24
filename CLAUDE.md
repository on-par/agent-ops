# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Architecture and Code Style

### Vertical Slice Architecture
Organize code by feature, not by technical layer. Each feature contains its own handlers, services, models, and tests. This keeps related code together and makes features easier to understand, modify, and delete.

### SOLID Principles
- **S - Single Responsibility**: A class/function has one reason to change
- **O - Open/Closed**: Open for extension, closed for modification
- **L - Liskov Substitution**: Subtypes must be substitutable for their base types
- **I - Interface Segregation**: Many specific interfaces over one general-purpose interface
- **D - Dependency Inversion**: Depend on abstractions, not concretions

### The Pragmatic Programmer
Key principles from Hunt & Thomas:
- **Tracer Bullets**: Build a thin, working end-to-end slice first, then iterate
- **Broken Windows**: Fix bad code immediately; disorder invites more disorder
- **Orthogonality**: Keep components independent; changes in one shouldn't affect others
- **Reversibility**: Avoid painting yourself into corners; keep decisions flexible
- **Good Enough Software**: Know when to stop; perfect is the enemy of done

### Clean Code
Key principles from Robert Martin:
- **Meaningful Names**: Names should reveal intent (`getUserById` not `getData`)
- **Small Functions**: Functions do one thing, do it well, do it only
- **Few Arguments**: Ideal is zero-to-two; three requires justification
- **No Side Effects**: Functions should be predictable and honest about what they do
- **Boy Scout Rule**: Leave code cleaner than you found it
- **Comments Are Failures**: If you need a comment, the code isn't clear enough

### DRY (Don't Repeat Yourself)
Every piece of knowledge should have a single, unambiguous representation. But apply the **Rule of Three**: don't abstract until you see the pattern three times. Premature DRY creates the wrong abstractions.

### Testing Principles

**Test-Driven Development (TDD)**
1. **Red**: Write a failing test for the behavior you want
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up while keeping tests green

**AAA Pattern** (Arrange-Act-Assert)
Structure every test in three clear sections:
- **Arrange**: Set up test data and preconditions
- **Act**: Execute the behavior under test
- **Assert**: Verify the expected outcome

**Test Pyramid**
Balance your test suite with more tests at the bottom, fewer at the top:
- **Unit Tests** (base, many): Fast, isolated, test single functions/classes
- **Integration Tests** (middle, some): Test component interactions and boundaries
- **E2E Tests** (top, few): Test complete user flows; slow but high confidence

**Testing Guidelines**
- Test behavior, not implementation
- One logical assertion per test
- Tests should be independent and repeatable
- Use descriptive test names that explain the scenario
