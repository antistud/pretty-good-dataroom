import { requireUser } from "@/lib/auth";
import { Flash } from "@/components/ui";
import StaffHome from "@/components/home/StaffHome";
import InvestorHome from "@/components/home/InvestorHome";
import SupporterHome from "@/components/home/SupporterHome";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireUser();
  return (
    <>
      <Flash sp={await searchParams} />
      {me.isStaff ? <StaffHome me={me} /> : me.role === "investor" ? <InvestorHome me={me} /> : <SupporterHome me={me} />}
    </>
  );
}
