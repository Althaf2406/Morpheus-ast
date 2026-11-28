import { HUB_URL_CONSTANT } from "./hubUrl";
import { withCurrentRepo } from "./repoParam";

/** Link back to the landing hub, carrying the current ?repo= if present. */
export function HubLink() {
  return (
    <a className="tour-link" href={withCurrentRepo(HUB_URL_CONSTANT)}>
      Hub
    </a>
  );
}
