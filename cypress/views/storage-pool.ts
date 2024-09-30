import {
  CEPH_DEFAULT_BLOCK_POOL_NAME,
  POOL_PROGRESS,
  POOL_TYPE,
} from '../constants/storage-pool-const';
import { STORAGE_SYSTEM_NAME } from '../consts';
import { NS } from '../utils/consts';
import { ODFCommon } from '../views/odf-common';
import { modal } from './modals';

// Pool var
export const replicaCount: string = '2';
export const scName: string = 'testing-sc';

export const poolMessage = (
  poolName: string,
  poolProgress: POOL_PROGRESS
): string => {
  switch (poolProgress) {
    case POOL_PROGRESS.FAILED:
      return `Pool "${poolName}" already exists`;
    case POOL_PROGRESS.CREATED:
      return `Pool ${poolName} was successfully created`;
    case POOL_PROGRESS.NOTALLOWED:
      return "Pool management tasks are not supported for default pool and ODF's external mode.";
    case POOL_PROGRESS.BOUNDED:
      return `${poolName} cannot be deleted. When a pool is bounded to PVC it cannot be deleted. Please detach all the resources from StorageClass(es):`;
    default:
      return '';
  }
};

export const navigateToStoragePoolList = () => {
  ODFCommon.visitStorageDashboard();
  cy.byLegacyTestID('horizontal-link-Storage Systems').click();
  cy.byLegacyTestID('item-filter').type(STORAGE_SYSTEM_NAME);
  cy.byTestRows('resource-row').get('td a').first().click();
  cy.byTestID('horizontal-link-Storage pools').click();
};

const prepareStorageClassForm = (poolType: POOL_TYPE) => {
  const provisioner = poolType === POOL_TYPE.BLOCK ? 'rbd' : 'cephfs';
  cy.log('Selecting provisioner');
  cy.byTestID('storage-class-provisioner-dropdown').click();
  cy.byLegacyTestID('dropdown-text-filter').type(
    `openshift-storage.${provisioner}.csi.ceph.com`
  );
  cy.byTestID('dropdown-menu-item-link')
    .contains(`openshift-storage.${provisioner}.csi.ceph.com`)
    .click();

  cy.log('Click on: Create new storage pool');
  cy.byTestID('pool-dropdown-toggle', { timeout: 1000 })
    .should('be.visible')
    .click();
  cy.byTestID('create-new-pool-button').should('be.visible').click();
};

export const fillPoolModalForm = (poolType: POOL_TYPE, poolName: string) => {
  prepareStorageClassForm(poolType);
  cy.log('Make sure the storage pool creation form is open');
  modal.shouldBeOpened();
  modal.modalTitleShouldContain('Create Storage Pool');
  fillStoragePoolForm(poolType, poolName);
};

export const createStoragePoolInSCForm = (
  poolType: POOL_TYPE,
  poolName: string
) => {
  fillPoolModalForm(poolType, poolName);
  triggerPoolFormFooterAction('create');

  cy.log(`Verify the ${poolType} pool creation`);
  cy.byTestID('empty-state-body').contains(
    poolMessage(poolName, POOL_PROGRESS.CREATED)
  );
  triggerPoolFormFooterAction(POOL_PROGRESS.CREATED);
  cy.byTestID('pool-dropdown-toggle').contains(poolName);
};

export const checkStoragePoolIsSelectableInSCForm = (poolName: string) => {
  cy.byTestID('pool-dropdown-toggle').should('be.visible').click();
  cy.byTestID(poolName).should('be.visible');
};

export const fillStoragePoolForm = (poolType: POOL_TYPE, poolName: string) => {
  cy.byTestID(`type-${poolType.toLowerCase()}`).click();
  cy.byTestID('new-pool-name-textbox').clear().type(poolName);
  cy.byTestID('replica-dropdown').click();
  cy.byLegacyTestID('replica-dropdown-item')
    .contains(`${replicaCount}-way Replication`)
    .click();
  cy.byTestID('compression-checkbox').check();
};

export enum Actions {
  created = 'created',
  failed = 'failed',
  notAllowed = 'notAllowed',
  bound = 'bounded',
}

export const triggerPoolFormFooterAction = (action: string) => {
  switch (action) {
    case Actions.failed:
      cy.log('Check try-again-action and finish-action are enabled');
      cy.byLegacyTestID('modal-try-again-action').should('be.visible');
      cy.byLegacyTestID('modal-finish-action').click();
      break;
    case Actions.created:
      cy.log('Check finish-action is enabled');
      cy.byLegacyTestID('modal-finish-action').click();
      break;
    case Actions.notAllowed:
      cy.log('Check close-action is enabled');
      cy.byLegacyTestID('modal-close-action').click();
      break;
    case Actions.bound:
      cy.log('Check go-to-pvc-list-action and close-action are enabled');
      cy.byLegacyTestID('modal-go-to-pvc-list-action').should('be.visible');
      cy.byLegacyTestID('modal-close-action').click();
      break;
    default:
      cy.log(`Invoke ${action} action`);
      cy.byLegacyTestID('confirm-action').scrollIntoView().click();
  }
};

export const verifyBlockPoolJSON = (
  poolName: string,
  compressionEnabled: boolean = true,
  replica: string = replicaCount
) => {
  cy.exec(
    `oc get cephBlockPool ${CEPH_DEFAULT_BLOCK_POOL_NAME} -n ${NS} -o json`
  ).then((response) => {
    const defaultBlockPool = JSON.parse(response.stdout);
    const defaultDeviceClass = defaultBlockPool.spec?.deviceClass;
    cy.exec(`oc get cephBlockPool ${poolName} -n ${NS} -o json`).then((res) => {
      const blockPool = JSON.parse(res.stdout);
      expect(blockPool.spec?.replicated?.size).to.equal(Number(replica));
      expect(blockPool.spec?.compressionMode).to.equal(
        compressionEnabled ? 'aggressive' : 'none'
      );
      expect(blockPool.spec?.parameters?.compression_mode).to.equal(
        compressionEnabled ? 'aggressive' : 'none'
      );
      expect(blockPool.spec?.deviceClass).to.equal(defaultDeviceClass);
    });
  });
};

export const createStoragePool = (poolType: POOL_TYPE, poolName: string) => {
  cy.byTestID('item-create').click();
  fillStoragePoolForm(poolType, poolName);
  triggerPoolFormFooterAction('create');
};

export const deleteBlockPoolFromCLI = (poolName: string) => {
  cy.log('Deleting the block pool');
  cy.exec(`oc delete CephBlockPool ${poolName} -n ${NS}`);
};

export const openStoragePoolKebab = (
  targetPoolName: string,
  isDefaultPool = false
) => {
  cy.byLegacyTestID('item-filter').clear().type(targetPoolName);
  cy.log('Only one resource should be present after filtering');
  cy.byTestID('kebab-button').should('have.length', 1);
  if (isDefaultPool) cy.byTestID('kebab-button').should('be.disabled');
  else cy.byTestID('kebab-button').click();
};

export const deleteStoragePool = (poolName: string) => {
  cy.log(`Delete a newly created pool`);
  navigateToStoragePoolList();
  openStoragePoolKebab(poolName);
  cy.byTestActionID('Delete Pool').click();
  cy.contains('Delete Storage Pool', { timeout: 5 * 1000 });
  triggerPoolFormFooterAction('delete');

  cy.log('Verify that the pool is not found.');
  cy.byLegacyTestID('item-filter').clear().type(poolName);
  cy.byTestID('kebab-button').should('have.length', 0);
};
