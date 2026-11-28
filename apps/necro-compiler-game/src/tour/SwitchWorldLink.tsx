import { withCurrentRepo } from "./repoParam";

export const INFRA_APP_URL = "https://infrashield-3d.vercel.app";

/** Link to the sibling city world, carrying the current ?repo= if present. */
export function SwitchWorldLink() {
  return (
    <a className="tour-link" href={withCurrentRepo(INFRA_APP_URL)}>
      Switch world
    </a>
  );
}
