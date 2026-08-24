import { AuthGate } from "@/components/AuthGate";
import { MoonApp } from "@/components/MoonApp";

export default function Home() {
  return <AuthGate><MoonApp /></AuthGate>;
}
