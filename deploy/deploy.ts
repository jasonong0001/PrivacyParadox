import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedGame = await deploy("ParadoxGame", {
    from: deployer,
    log: true,
  });

  console.log(`ParadoxGame contract: `, deployedGame.address);
};
export default func;
func.id = "deploy_twenty_one_game"; // id required to prevent reexecution
func.tags = ["ParadoxGame"];
