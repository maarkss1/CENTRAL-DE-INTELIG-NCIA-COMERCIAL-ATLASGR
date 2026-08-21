import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CommercialIntelligenceHub } from "../../src/features/commercial-intelligence/components/CommercialIntelligenceHub";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../../src/contexts/AuthContext";

// Mocks to avoid complex backend setups
vi.mock("../../src/hooks/useDatabase", () => ({
  useDatabase: vi.fn(() => ({ data: [], loading: false, error: null }))
}));
vi.mock("../../src/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: any) => <>{children}</>,
  useAuth: vi.fn(() => ({ user: { name: "Test User", role: "ADMIN" } }))
}));

describe("CommercialIntelligenceHub", () => {
  it("renders without crashing", () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <CommercialIntelligenceHub />
        </AuthProvider>
      </BrowserRouter>
    );
    expect(true).toBe(true);
  });
});
