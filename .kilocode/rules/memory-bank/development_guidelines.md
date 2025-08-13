# Development Guidelines

This document outlines the core development practices and methodologies followed in this project.

## Test-Driven Development (TDD)

All new features and significant modifications should adhere to the Test-Driven Development (TDD) methodology. This involves:

1. **Writing Failing Tests First**: Before writing any implementation code, write a test that defines the desired behavior and is expected to fail.
2. **Minimal Implementation**: Write only the necessary code to make the failing test pass.
3. **Refactor**: Refactor the code to improve its design, readability, and maintainability, ensuring all tests continue to pass.

This iterative process ensures that the codebase is well-tested, robust, and maintains a clear understanding of expected behavior.

## Task Decomposition

Large and complex tasks must be broken down into smaller, manageable sub-tasks. Each sub-task should have a clear objective and contribute to the overall goal. This approach facilitates:

- Improved clarity and focus
- Easier progress tracking
- Reduced risk of errors
- More efficient debugging
- Better collaboration within the team

Consistently apply this decomposition, adding tests before code implementation for each sub-task and repeating the TDD cycle until all tasks are finished.
