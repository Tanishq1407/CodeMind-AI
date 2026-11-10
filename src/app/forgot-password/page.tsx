import {PublicPage} from "@/components/site";import {ForgotPasswordForm} from "@/components/password-forms";
export default function Forgot(){return <PublicPage title="Reset your password" description="We’ll send a time-limited reset link if an eligible account exists."><div className="card" style={{maxWidth:480,margin:"0 auto 70px"}}><ForgotPasswordForm/></div></PublicPage>}
