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
            OrgMembership(id: "a", name: "A", slug: "a", logo: nil, credits: 5, role: "owner", isActive: true),
            OrgMembership(id: "b", name: "B", slug: "b", logo: nil, credits: 0, role: "member", isActive: false),
        ]
        XCTAssertTrue(GroupSettingsSupport.canTransferCredits(organizations: orgs))

        let single = [orgs[0]]
        XCTAssertFalse(GroupSettingsSupport.canTransferCredits(organizations: single))

        let noCredits = [
            OrgMembership(id: "a", name: "A", slug: "a", logo: nil, credits: 0, role: "owner", isActive: true),
            OrgMembership(id: "b", name: "B", slug: "b", logo: nil, credits: 0, role: "member", isActive: false),
        ]
        XCTAssertFalse(GroupSettingsSupport.canTransferCredits(organizations: noCredits))
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
        let error = APIError.server(status: 403, message: "capacity_exceeded", code: nil)
        XCTAssertEqual(
            GroupSettingsSupport.createGroupOutcome(from: error, isCrewMember: true),
            .crewGroupLimitReached(limit: 5)
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
