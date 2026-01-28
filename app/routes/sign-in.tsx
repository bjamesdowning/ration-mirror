// @ts-nocheck
import { AuthWidget } from "~/components/auth";

export default function SignInPage() {
	return (
		<div className="flex items-center justify-center min-h-screen bg-ceramic p-8">
			<AuthWidget defaultMode="signIn" showLogo={true} showFooterLinks={true} />
		</div>
	);
}
