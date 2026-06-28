# Mobile Readability, Logo and Driver Polish Fix - 2026

## Scope
UI-only mobile polish pass. No backend, API, auth, route, role, database or business logic changes.

## Fixed
- Improved contrast for unreadable buttons and text in mobile light mode.
- Normalized mobile buttons so labels stay visible on primary, outline and white buttons.
- Improved badge/pill text contrast on pale backgrounds.
- Removed the duplicate-looking JTS logo on mobile login by hiding the header logo and keeping the login card logo.
- Removed the JTS logo from the Driver mobile header for a cleaner app-like header.
- Refined Driver mobile layout for easier one-hand use:
  - cleaner sticky header
  - stronger current trip hierarchy
  - bigger quick action cards
  - clearer chat action
  - more readable load cards, route blocks, metrics, accordions and document rows
  - improved floating chat button

## Files changed
- public/assets/enterprise-mobile-native-redesign.css
- android/app/src/main/assets/public/assets/enterprise-mobile-native-redesign.css
- app/src/main/assets/public/assets/enterprise-mobile-native-redesign.css

## Verification
- Changes are CSS-only and do not modify application logic.
- Existing HTML, JS workflows, API calls and backend files remain unchanged.
