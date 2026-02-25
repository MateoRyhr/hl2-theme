# Change Log

All notable changes to the "hl2-theme" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased] - 2026-02-19

## [1.0.0] - 2026-02-24

## [1.0.1] - 2026-02-24

### Fixed

- **Windows Audio System:** Upgraded the audio playback engine on Windows to use the native WPF `MediaPlayer` API. This prevents the Windows 11 GUI media player from popping up during background events and ensures a 100% headless experience.

- **Path Handling on Windows:** Resolved an execution bug where audio files located in paths with spaces or special characters would fail to play. The PowerShell execution is now fully shielded using Base64 encoding.

## [1.0.2] - 2026-02-25

### Added

- **Markdown Preview Immersion:** The Half-Life 2 theme colors now fully apply to the built-in VS Code Markdown Preview window.

- **Highlight.js Override:** Injected custom CSS to ensure multiline code blocks inside Markdown files correctly render the Lambda Orange, Gravity Gun Blue, and Radioactive Green syntax highlighting, bypassing the default WebView text limitations.
