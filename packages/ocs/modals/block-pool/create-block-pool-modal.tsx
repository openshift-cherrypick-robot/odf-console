import * as React from 'react';
import { ONE_SECOND } from '@odf/shared/constants';
import { ModalTitle, ModalFooter } from '@odf/shared/generic/ModalTitle';
import {
  HandlePromiseProps,
  withHandlePromise,
} from '@odf/shared/generic/promise-component';
import { ModalBody } from '@odf/shared/modals/Modal';
import { getNamespace } from '@odf/shared/selectors';
import { CephClusterKind } from '@odf/shared/types';
import { useCustomTranslation } from '@odf/shared/useCustomTranslationHook';
import { getValidWatchK8sResourceObj } from '@odf/shared/utils';
import {
  k8sCreate,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { ModalComponent } from '@openshift-console/dynamic-plugin-sdk/lib/app/modal-support/ModalProvider';
import { Modal } from '@patternfly/react-core';
import { BlockPoolStatus, BlockPoolBody } from '../../block-pool/body';
import { getPoolKindObj, poolResource } from '../../block-pool/CreateBlockPool';
import {
  BlockPoolActionType,
  blockPoolInitialState,
  blockPoolReducer,
} from '../../block-pool/reducer';
import { POOL_STATE, POOL_PROGRESS } from '../../constants';
import { CephBlockPoolModel } from '../../models';
import { StoragePoolKind } from '../../types';
import { BlockPoolModalFooter, FooterPrimaryActions } from './modal-footer';
import './create-block-pool-modal.scss';

export const CreateBlockPoolModal = withHandlePromise(
  (props: CreateBlockPoolModalProps) => {
    const {
      cephCluster,
      onPoolCreation,
      handlePromise,
      errorMessage,
      defaultDeviceClass,
    } = props;
    const { t } = useCustomTranslation();

    const poolNs = getNamespace(cephCluster);

    const [state, dispatch] = React.useReducer(
      blockPoolReducer,
      blockPoolInitialState
    );
    const [isSubmit, setIsSubmit] = React.useState(false);
    const [timer, setTimer] = React.useState<NodeJS.Timer>(null);

    const poolName = state.poolName;

    const MODAL_DESC = t(
      'A BlockPool is a logical entity providing elastic capacity to applications and workloads. Pools provide a means of supporting policies for access data resilience and storage efficiency.'
    );
    const MODAL_TITLE = t('Create BlockPool');

    // Watch newly created pool after submit
    const [newPool, newPoolLoaded, newPoolLoadError] =
      useK8sWatchResource<StoragePoolKind>(
        getValidWatchK8sResourceObj(
          poolResource(poolName, poolNs),
          isSubmit && !!poolName
        )
      );

    React.useEffect(() => {
      if (isSubmit) {
        if (
          newPool &&
          newPoolLoaded &&
          newPool?.status?.phase === POOL_STATE.READY
        ) {
          dispatch({
            type: BlockPoolActionType.SET_POOL_STATUS,
            payload: POOL_PROGRESS.CREATED,
          });
          setIsSubmit(false);
          clearTimeout(timer);
          onPoolCreation(poolName);
        } else if (
          newPoolLoaded &&
          (newPool?.status?.phase === POOL_STATE.RECONCILE_FAILED ||
            newPool?.status?.phase === POOL_STATE.FAILURE)
        ) {
          dispatch({
            type: BlockPoolActionType.SET_POOL_STATUS,
            payload: POOL_PROGRESS.NOTREADY,
          });
          setIsSubmit(false);
          clearTimeout(timer);
        } else if (
          newPoolLoaded &&
          newPoolLoadError &&
          newPoolLoadError?.response?.status !== 404
        ) {
          dispatch({
            type: BlockPoolActionType.SET_POOL_STATUS,
            payload: POOL_PROGRESS.FAILED,
          });
          setIsSubmit(false);
          clearTimeout(timer);
        }
      }
    }, [
      isSubmit,
      newPool,
      newPoolLoadError,
      newPoolLoaded,
      onPoolCreation,
      poolName,
      timer,
    ]);

    // Create new pool
    const createPool = () => {
      if (state.poolStatus === '') {
        dispatch({
          type: BlockPoolActionType.SET_POOL_STATUS,
          payload: POOL_PROGRESS.PROGRESS,
        });
        const poolObj: StoragePoolKind = getPoolKindObj(
          state,
          poolNs,
          defaultDeviceClass
        );

        handlePromise(
          k8sCreate({ model: CephBlockPoolModel, data: poolObj }),
          () => {
            setIsSubmit(true);
            // The modal will wait for 15 sec to get feedback from Rook
            const timeoutTimer = setTimeout(() => {
              dispatch({
                type: BlockPoolActionType.SET_POOL_STATUS,
                payload: POOL_PROGRESS.TIMEOUT,
              });
              setIsSubmit(false);
            }, 30 * ONE_SECOND);
            setTimer(timeoutTimer);
          },
          () => {
            dispatch({
              type: BlockPoolActionType.SET_POOL_STATUS,
              payload: POOL_PROGRESS.FAILED,
            });
          }
        );
      }
    };

    return (
      <Modal
        isOpen
        onClose={props.closeModal}
        className="modal-content create-block-pool__modal"
        variant="small"
      >
        <ModalTitle>{MODAL_TITLE}</ModalTitle>
        <ModalBody>
          <p>{MODAL_DESC}</p>
          {state.poolStatus ? (
            <div key="progress-modal">
              <BlockPoolStatus
                status={state.poolStatus}
                name={poolName}
                error={errorMessage}
              />
            </div>
          ) : (
            <BlockPoolBody
              cephCluster={cephCluster}
              state={state}
              dispatch={dispatch}
              showPoolStatus
            />
          )}
        </ModalBody>
        <ModalFooter inProgress={state.poolStatus === POOL_PROGRESS.PROGRESS}>
          <BlockPoolModalFooter
            state={state}
            dispatch={dispatch}
            onSubmit={createPool}
            cancel={props.closeModal}
            close={props.closeModal}
            primaryAction={FooterPrimaryActions(t).CREATE}
          />
        </ModalFooter>
      </Modal>
    );
  }
);

export type CreateBlockPoolModalProps = {
  cephCluster?: CephClusterKind;
  onPoolCreation: (name: string) => void;
  defaultDeviceClass: string;
} & React.ComponentProps<ModalComponent> &
  HandlePromiseProps;
