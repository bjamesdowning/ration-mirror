import XCTest
@testable import Ration

final class GroupSettingsViewModelTests: XCTestCase {
    func testMemberDisplayNamePrefersName() {
        let user = GroupMemberUser(name: "Ada Lovelace", email: "ada@example.com", image: nil)
        XCTAssertEqual(GroupSettingsSupport.memberDisplayName(user), "Ada Lovelace")
    }

    func testMemberDisplayNameFallsBackToEmail() {
        let user = GroupMemberUser(name: nil, email: "ada@example.com", image: nil)
        XCTAssertEqual(GroupSettingsSupport.memberDisplayName(user), "ada@example.com")
    }

    func testCanShowInviteButtonForOwnerAndAdmin() {
        XCTAssertTrue(GroupSettingsSupport.canShowInviteButton(currentUserRole: "owner"))
        XCTAssertTrue(GroupSettingsSupport.canShowInviteButton(currentUserRole: "admin"))
        XCTAssertFalse(GroupSettingsSupport.canShowInviteButton(currentUserRole: "member"))
    }

    func testCanManageMemberRoleRules() {
        XCTAssertFalse(GroupSettingsSupport.canManageMemberRole(currentUserRole: "owner", targetRole: "owner"))
        XCTAssertTrue(GroupSettingsSupport.canManageMemberRole(currentUserRole: "owner", targetRole: "admin"))
        XCTAssertTrue(GroupSettingsSupport.canManageMemberRole(currentUserRole: "admin", targetRole: "member"))
        XCTAssertFalse(GroupSettingsSupport.canManageMemberRole(currentUserRole: "admin", targetRole: "admin"))
        XCTAssertFalse(GroupSettingsSupport.canManageMemberRole(currentUserRole: "member", targetRole: "member"))
    }

    func testAdminPromoteOnly() {
        XCTAssertTrue(GroupSettingsSupport.adminPromoteOnly(currentUserRole: "admin", targetRole: "member"))
        XCTAssertFalse(GroupSettingsSupport.adminPromoteOnly(currentUserRole: "owner", targetRole: "member"))
    }

    func testRolePickerOptionsOwnerOnly() {
        XCTAssertEqual(GroupSettingsSupport.rolePickerOptions(currentUserRole: "owner"), ["member", "admin"])
        XCTAssertEqual(GroupSettingsSupport.rolePickerOptions(currentUserRole: "admin"), [])
    }

    func testCanTransferOwnershipRequiresOwnerAndOtherMembers() {
        XCTAssertTrue(GroupSettingsSupport.canTransferOwnership(isOwner: true, nonOwnerMemberCount: 1))
        XCTAssertFalse(GroupSettingsSupport.canTransferOwnership(isOwner: true, nonOwnerMemberCount: 0))
        XCTAssertFalse(GroupSettingsSupport.canTransferOwnership(isOwner: false, nonOwnerMemberCount: 2))
    }

    func testCanTransferCreditsRequiresOwnerCreditsAndMultipleOrgs() {
        let orgs = [
            OrgMembership(id: "a", name: "A", slug: "a", logo: nil, credits: 5, role: "owner", isActive: true, isPersonal: nil),
            OrgMembership(id: "b", name: "B", slug: "b", logo: nil, credits: 0, role: "member", isActive: false, isPersonal: nil),
        ]
        XCTAssertTrue(GroupSettingsSupport.canTransferCredits(organizations: orgs))

        let single = [orgs[0]]
        XCTAssertFalse(GroupSettingsSupport.canTransferCredits(organizations: single))

        let noCredits = [
            OrgMembership(id: "a", name: "A", slug: "a", logo: nil, credits: 0, role: "owner", isActive: true, isPersonal: nil),
            OrgMembership(id: "b", name: "B", slug: "b", logo: nil, credits: 0, role: "member", isActive: false, isPersonal: nil),
        ]
        XCTAssertFalse(GroupSettingsSupport.canTransferCredits(organizations: noCredits))
    }

    func testMaxTransferAmountCapsAtSourceBalanceAndApiLimit() {
        XCTAssertEqual(GroupSettingsSupport.maxTransferAmount(sourceCredits: 5), 5)
        XCTAssertEqual(GroupSettingsSupport.maxTransferAmount(sourceCredits: 50_000), 10_000)
        XCTAssertEqual(GroupSettingsSupport.maxTransferAmount(sourceCredits: 0), 1)
    }

    func testClampedTransferAmountStaysWithinSourceAndApiBounds() {
        XCTAssertEqual(GroupSettingsSupport.clampedTransferAmount(3, sourceCredits: 5), 3)
        XCTAssertEqual(GroupSettingsSupport.clampedTransferAmount(0, sourceCredits: 5), 1)
        XCTAssertEqual(GroupSettingsSupport.clampedTransferAmount(99, sourceCredits: 5), 5)
        XCTAssertEqual(GroupSettingsSupport.clampedTransferAmount(20_000, sourceCredits: 50_000), 10_000)
    }

    /// Regression: chrome credits bind to SessionStore; after transfer the settings VM
    /// must adopt the refreshed global session (not a local-only reload).
    @MainActor
    func testSessionAfterCreditTransferUsesGlobalStoreCredits() {
        let staleLocal = SessionResponse.fixture(credits: 10, orgCredits: [("a", 10), ("b", 5)])
        let refreshedGlobal = SessionResponse.fixture(credits: 15, orgCredits: [("a", 15), ("b", 0)])

        let model = GroupSettingsViewModel()
        model.applySessionForTesting(staleLocal)
        XCTAssertEqual(model.session?.credits, 10)

        // Mirrors transferCredits: session = env.session.session after SessionStore.load
        model.applySessionForTesting(refreshedGlobal)
        XCTAssertEqual(model.session?.credits, 15)
        XCTAssertEqual(model.session?.organizations.first(where: { $0.id == "a" })?.credits, 15)
        XCTAssertEqual(model.session?.organizations.first(where: { $0.id == "b" })?.credits, 0)
    }

    func testSlugSuggestionNormalizesName() {
        XCTAssertEqual(GroupSettingsSupport.slugSuggestion(from: "Home Kitchen"), "home-kitchen")
        XCTAssertEqual(GroupSettingsSupport.slugSuggestion(from: "  Space Station 1  "), "space-station-1")
    }

    func testIsValidSlug() {
        XCTAssertTrue(GroupSettingsSupport.isValidSlug("home-kitchen-1"))
        XCTAssertFalse(GroupSettingsSupport.isValidSlug("Home Kitchen"))
        XCTAssertFalse(GroupSettingsSupport.isValidSlug(""))
    }

    func testCreateGroupOutcomeMapsFeatureGatedToPaywall() {
        let error = APIError.server(status: 403, message: "feature_gated", code: nil)
        XCTAssertEqual(
            GroupSettingsSupport.createGroupOutcome(from: error, isCrewMember: false),
            .showPaywall
        )
    }

    func testCreateGroupOutcomeMapsFreeCapacityToPaywall() {
        let error = APIError.server(status: 403, message: "capacity_exceeded", code: nil)
        XCTAssertEqual(
            GroupSettingsSupport.createGroupOutcome(from: error, isCrewMember: false),
            .showPaywall
        )
    }

    func testCreateGroupOutcomeMapsCrewCapacityToLimitMessage() {
        let error = APIError.server(
            status: 403,
            message: "capacity_exceeded",
            code: nil,
            errorCode: "capacity_exceeded",
            limit: 5
        )
        XCTAssertEqual(
            GroupSettingsSupport.createGroupOutcome(from: error, isCrewMember: true),
            .crewGroupLimitReached(limit: 5)
        )
    }

    func testOwnedGroupCountCountsOwnerRoleOnly() {
        let orgs = [
            OrgMembership(id: "a", name: "A", slug: "a", logo: nil, credits: 0, role: "owner", isActive: true, isPersonal: nil),
            OrgMembership(id: "b", name: "B", slug: "b", logo: nil, credits: 0, role: "member", isActive: false, isPersonal: nil),
            OrgMembership(id: "c", name: "C", slug: "c", logo: nil, credits: 0, role: "owner", isActive: false, isPersonal: nil),
        ]
        XCTAssertEqual(GroupSettingsSupport.ownedGroupCount(in: orgs), 2)
    }

    func testCanCreateGroupAllowsBelowLimit() {
        let orgs = (0..<4).map { i in
            OrgMembership(
                id: "org-\(i)",
                name: "G\(i)",
                slug: "g\(i)",
                logo: nil,
                credits: 0,
                role: "owner",
                isActive: i == 0,
                isPersonal: nil
            )
        }
        XCTAssertTrue(GroupSettingsSupport.canCreateGroup(organizations: orgs, isCrewMember: true))
    }

    func testCanCreateGroupBlocksAtCrewLimit() {
        let orgs = (0..<5).map { i in
            OrgMembership(
                id: "org-\(i)",
                name: "G\(i)",
                slug: "g\(i)",
                logo: nil,
                credits: 0,
                role: "owner",
                isActive: i == 0,
                isPersonal: nil
            )
        }
        XCTAssertFalse(GroupSettingsSupport.canCreateGroup(organizations: orgs, isCrewMember: true))
    }

    func testTransferOwnershipErrorMessageForRecipientCapacity() {
        let error = APIError.server(
            status: 403,
            message: "This member already owns the maximum number of groups (5) and cannot take ownership of another.",
            code: nil,
            errorCode: "recipient_capacity_exceeded",
            limit: 5
        )
        XCTAssertEqual(
            GroupSettingsSupport.transferOwnershipErrorMessage(from: error),
            "This member already owns the maximum number of groups (5) and cannot take ownership of another."
        )
    }

    func testTransferOwnershipErrorMessagePrefersServerFreeTierCopy() {
        let error = APIError.server(
            status: 403,
            message: "This member is on the free plan and can only own 1 group. They need Crew to take ownership of another.",
            code: nil,
            errorCode: "recipient_capacity_exceeded",
            limit: 1
        )
        XCTAssertEqual(
            GroupSettingsSupport.transferOwnershipErrorMessage(from: error),
            "This member is on the free plan and can only own 1 group. They need Crew to take ownership of another."
        )
    }

    func testTransferOwnershipErrorMessageFallsBackWhenOnlyMachineCode() {
        let error = APIError.server(
            status: 403,
            message: "recipient_capacity_exceeded",
            code: nil,
            errorCode: "recipient_capacity_exceeded",
            limit: 1
        )
        XCTAssertEqual(
            GroupSettingsSupport.transferOwnershipErrorMessage(from: error),
            "This member already owns the maximum number of groups (1) and cannot take ownership of another."
        )
    }

    func testCreateGroupErrorMessageForCrewLimit() {
        XCTAssertEqual(
            GroupSettingsSupport.createGroupErrorMessage(from: .crewGroupLimitReached(limit: 5)),
            "You've reached your 5-group limit. Delete a group you own to create another."
        )
    }

    func testInvitationAcceptURLUsesWebOrigin() {
        let url = GroupSettingsSupport.invitationAcceptURL(
            invitationId: "abc-123",
            webOrigin: URL(string: "https://ration.mayutic.com")!
        )
        XCTAssertEqual(url.absoluteString, "https://ration.mayutic.com/invitations/accept?id=abc-123")
    }
}

private extension SessionResponse {
    static func fixture(credits: Int, orgCredits: [(String, Int)]) -> SessionResponse {
        let orgs = orgCredits.enumerated().map { index, pair in
            OrgMembership(
                id: pair.0,
                name: pair.0.uppercased(),
                slug: pair.0,
                logo: nil,
                credits: pair.1,
                role: "owner",
                isActive: index == 0,
                isPersonal: nil
            )
        }
        let active = orgs[0]
        return SessionResponse(
            user: MobileUser(id: "u1", name: "Test", email: "test@example.com", image: nil),
            organization: Organization(
                id: active.id,
                name: active.name,
                slug: active.slug,
                logo: nil,
                credits: credits
            ),
            credits: credits,
            tier: "free",
            isTierExpired: false,
            organizations: orgs,
            aiCosts: nil,
            clientFlags: nil
        )
    }
}
