# Groups and membership

A **group** (organization) is a shared kitchen workspace: Cargo, Galley, Manifest, Supply, and the **AI credit** balance all belong to that group. Membership and admin live under **Hub → Settings → Group** (and the group switcher chrome on mobile).

To **switch** which group is active while you work, see *Switching groups*. Invite and share gates depend on the **owner’s** plan — see *Free vs Crew Member*.

## Actions

- **Create group** — Open **New group** (or Settings → Group). Free owners typically hold **one** owned group; Crew raises the owned-group cap. The new group starts with its own empty kitchen and credit pool.
- **Set default group** — In **Settings → Account**, choose which group opens after sign-in when you belong to more than one.
- **Rename / avatar** — Owners and admins update the group **name** and **avatar** in Settings → Group.
- **Invite member** — Owners and admins create an invitation link when the owner’s tier allows invites (**Crew Member**). Invitees join as **members** by default. See *Free vs Crew Member* for gating.
- **Accept invitation** — Open the invite link, sign in if needed, and accept on the **Accept invitation** screen. You become a member of that group.
- **Change member role** — Owners (and admins, for members) promote or demote between **member** and **admin** in the member list. Ownership itself is not changed here.
- **Transfer ownership** — The current **owner** transfers ownership to another existing member. The former owner becomes a non-owner member and loses owner-only actions (delete group, credit transfer).
- **Remove member** — The **owner** removes an admin or member from the group (per person). The owner row cannot be removed this way. Kitchen data stays with the group.
- **Leave group** — **Admins and members** leave the active group from Settings → Danger Zone (or iOS Group Settings). **Owners cannot leave** — transfer ownership first, then leave, or delete the group. You cannot leave a **personal** group.
- **Transfer credits between orgs** — An **owner** moves credits from a group they own to another group they belong to. Amounts are capped by the source balance.
- **Org supply planning horizon** — Owners and admins set how many days ahead Manifest meals feed Supply (**1–30**, default **7**) via Supply options or Group Settings. Members see the active window read-only. See *Supply (shopping list)*.
- **Delete group** — Owners can delete a non-personal group (with confirmation). **Personal** groups are not deleted standalone; removing them requires **account purge**. Deletion removes that group’s kitchen data.

## Membership exit

| Role | How membership ends |
|------|---------------------|
| **Member / Admin** | **Leave group** (self), or owner **Remove member** |
| **Owner** | **Transfer ownership** then leave as a member, **Delete group**, or **Account purge** |

Leaving or being removed clears that user’s active session for the group (and default-group preference if it pointed at that org). Group kitchen data is not deleted.
