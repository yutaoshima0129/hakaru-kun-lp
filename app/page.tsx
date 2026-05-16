import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Problems from "@/components/Problems";
import Solution from "@/components/Solution";
import Features from "@/components/Features";
import Haccp from "@/components/Haccp";
import Industries from "@/components/Industries";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Problems />
        <Solution />
        <Features />
        <Haccp />
        <Industries />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
