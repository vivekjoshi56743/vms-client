import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createUser,
  deleteUser,
  getUser,
  getUsers,
  patchUser,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/api/users";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: getUsers,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ["users", id],
    queryFn: () => getUser(id),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`User "${user.username}" created`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function usePatchUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      patchUser(id, input),
    onSuccess: (user) => {
      queryClient.setQueryData(["users", user.id], user);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ["users", id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("User deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
