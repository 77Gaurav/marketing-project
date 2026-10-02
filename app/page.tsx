import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import VenueCategories from '@/components/VenueCategories';
import WorkflowSection from '@/components/WorkflowSection';
import LocationsSection from '@/components/LocationsSection';
import PlatformSection from '@/components/PlatformSection';
import PricingSection from '@/components/PricingSection';
import FooterBanner from '@/components/FooterBanner';
import Footer from '@/components/Footer';
import ModalProvider from '@/components/ui/ModalProvider';

/**
 * Server Component. Only the interactive leaves ship client JS — the sections themselves are
 * static markup apart from the provider that owns dialog state.
 */
export default function Home() {
  return (
    <ModalProvider>
      <Navbar />
      <main id="main">
        <HeroSection />
        <VenueCategories />
        <WorkflowSection />
        <LocationsSection />
        <PlatformSection />
        <PricingSection />
        <FooterBanner />
      </main>
      <Footer />
    </ModalProvider>
  );
}
