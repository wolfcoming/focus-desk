# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user is a solo knowledge worker managing their own projects and daily obligations on a personal desktop. Near-term use is personal; later the product may be offered more broadly to internet users with similar needs. No multi-user collaboration is confirmed for this phase.

## Product Purpose

Little Fun is a personal project-management desktop app that helps someone keep a few important things moving without drowning in lists. Success means the user can see today’s focus, clear light todos, advance project subtasks, and handle blocked follow-ups with soft capacity reminders—not hard gates.

## Positioning

The product centers on “今日三件” (at most three personally chosen project tasks for the day), recurring daily duties from periodic subtasks, soft caps on concurrent active projects and subtasks, and gentle interruption/reminder flows. A neighboring generic todo app could not truthfully claim this same focus-and-capacity ritual as its core mechanism.

## Operating Context

Runs as a Tauri desktop app (Windows and macOS) with a local SQLite store; closing the main window leaves the tray for reminders. Login-at-startup is optional. AI is used only for specific assists (todo affiliation, today suggestions, weekly summary, blocked-item phrasing, matching “what I’m doing now”); switch suggestions follow local rules. Important/urgent come from the user’s quadrant marks; system interrupts emphasize important items with due/follow-up times.

## Capabilities and Constraints

Confirmed surfaces: 待办, 大项目 / 子任务 (常规 / 周期性), 今日三件, 今天的日常, 阻塞项 (in project detail), 设置. Soft caps: roughly ≤3 active large projects and ≤5 active subtasks (reminders only). Terminology in the current Chinese UI is the product vocabulary but is not locked as an immutable brand asset for redesign. Navigation structure and current layout are not binding constraints for a visual redesign. Stack and native packaging remain Tauri + React/Vite; redesign must preserve working behavior and local-data model.

## Brand Commitments

Product name: **Little Fun**. Desired first impression for redesign: like a clean desktop workbench—clear, calm, practical. No other locked visual brand assets or logo files are confirmed.

## Evidence on Hand

README.md describes product scope and terminology. Live UI lives under `src/` (App shell, Today, Todos, Projects, Progress, Weekly, Settings, Reminder) with `src/styles.css`. Sample data can be loaded from Settings. Do not invent customers, reviews, pricing, or usage metrics.

## Product Principles

1. Protect focus: few concurrent commitments beat endless lists.
2. Stay local-first and trustworthy with the user’s own data.
3. Interrupt gently; remind, don’t force.
4. Keep the workbench clear—structure should feel like a clean desk, not a crowded dashboard.
5. Prefer clarity of today’s work over decorative complexity.
