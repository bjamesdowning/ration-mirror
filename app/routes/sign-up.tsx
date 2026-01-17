import { SignUp } from "@clerk/react-router";

export default function SignUpPage() {
	return (
		<div className="flex items-center justify-center min-h-screen bg-[#051105]">
			<div className="backdrop-blur-md bg-white/5 border border-white/20 p-8 rounded-none shadow-[0_0_15px_rgba(57,255,20,0.2)]">
				<SignUp />
			</div>
		</div>
	);
}
