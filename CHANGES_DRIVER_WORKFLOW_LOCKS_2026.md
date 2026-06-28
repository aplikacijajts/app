# Driver workflow, BOL approval lock and mobile UI fixes

Implemented requested driver workflow improvements:

1. Driver notifications now open directly to the relevant load/document screen and mark the notification as read.
2. Driver portal order is now: My Active Loads, chat notifications/dispatcher, My Availability.
3. My Active Loads now displays route, customer, rate, docs status, status and an inline details panel on the same page.
4. Load Details now presents a JTS Confirmation-style detail section using the same load/ITS data fields used by forms/PDFs.
5. After a driver accepts a load, delivery details remain locked until BOL is uploaded and approved by admin/dispatcher.
6. Driver cannot accept another load or continue trip status steps while a previously accepted load is waiting for BOL approval.
7. If BOL/document is rejected/needs fix, the driver receives the reason in a notification/pop-up message.
8. When BOL is approved, the driver receives a notification and the delivery address is unlocked.
9. Mobile notification/menu z-index was adjusted so notifications no longer cover the sandwich/menu controls.
10. Global Back button added to all protected screens except login/register.
11. "Open menu" wording was removed and replaced by "Menu".
12. Driver Home now shows only the current load plus a fuel/profit calculator.
13. Fuel page improved for iPhone geolocation requirements, current location, and nearest-station list.
14. Floating chat access remains available through the driver navigation/menu and chat notifications section.

Validation:
- `npm run check` completed successfully.
